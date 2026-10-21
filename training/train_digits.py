"""Train the digit classifier that reads the card's digit boxes.

Usage: uv run python train_digits.py [--epochs N] [--dataset emnist|mnist]

The model only ever sees one box at a time, and only answers 0-9. Training
digits come from EMNIST (or MNIST as a fallback), augmented to look like a pen
or pencil digit written in a box at the beach. Every sample then goes through
`normalize`, which mirrors `normalizeDigit` in src/core/digitPrep.ts exactly,
so the model sees the same kind of input in training as in the app.

Writes
- ../public/models/digits.onnx, the model the app loads
- ../public/models/digits.json, accuracy and provenance
- ../tests/fixtures/glyphs/digits.png and digits.json, held-out test-split
  digits the fixture generator writes onto synthetic cards
"""

from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image
from scipy import ndimage
from torch.utils.data import DataLoader, Dataset
from torchvision import datasets

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(__file__).resolve().parent / "data"

# Must match src/core/digitPrep.ts
OUT = 28
FIT = 20
INK_THRESHOLD = 0.35

# The box interior the app crops, in pixels at 6 px/mm after the inset
BOX_PX = 32


def bilinear_resize(img: np.ndarray, out_h: int, out_w: int) -> np.ndarray:
    """Resize by bilinear sampling at output pixel centres, as digitPrep.ts does."""
    in_h, in_w = img.shape
    ys = (np.arange(out_h) + 0.5) * in_h / out_h - 0.5
    xs = (np.arange(out_w) + 0.5) * in_w / out_w - 0.5
    ys = np.clip(ys, 0, in_h - 1)
    xs = np.clip(xs, 0, in_w - 1)
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    y1 = np.minimum(y0 + 1, in_h - 1)
    x1 = np.minimum(x0 + 1, in_w - 1)
    wy = (ys - y0)[:, None]
    wx = (xs - x0)[None, :]
    top = img[y0][:, x0] * (1 - wx) + img[y0][:, x1] * wx
    bottom = img[y1][:, x0] * (1 - wx) + img[y1][:, x1] * wx
    return top * (1 - wy) + bottom * wy


def normalize(ink: np.ndarray) -> np.ndarray:
    """MNIST-style normalization of an ink map in [0, 1] to a 28x28 model input.

    Crops to the ink's bounding box, scales the longer side to 20 px, and
    places the result so its centre of mass sits at the centre of a 28x28
    image. Returns all zeros when there's no ink.
    """
    mask = ink > INK_THRESHOLD
    out = np.zeros((OUT, OUT), dtype=np.float32)
    if not mask.any():
        return out
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    crop = ink[rows[0] : rows[-1] + 1, cols[0] : cols[-1] + 1]
    h, w = crop.shape
    scale = FIT / max(h, w)
    nh, nw = max(1, round(h * scale)), max(1, round(w * scale))
    small = bilinear_resize(crop, nh, nw)
    total = small.sum()
    if total <= 0:
        return out
    cy = (small.sum(axis=1) * np.arange(nh)).sum() / total
    cx = (small.sum(axis=0) * np.arange(nw)).sum() / total
    oy = round(OUT / 2 - 0.5 - cy)
    ox = round(OUT / 2 - 0.5 - cx)
    paste(out, small, oy, ox, np.copyto)
    return out


def paste(dst: np.ndarray, src: np.ndarray, oy: int, ox: int, combine) -> None:
    """Combine `src` into `dst` with its top-left at (oy, ox), clipping at the edges."""
    y0, x0 = max(0, oy), max(0, ox)
    y1, x1 = min(dst.shape[0], oy + src.shape[0]), min(dst.shape[1], ox + src.shape[1])
    if y1 <= y0 or x1 <= x0:
        return
    region = src[y0 - oy : y1 - oy, x0 - ox : x1 - ox]
    combine(dst[y0:y1, x0:x1], region)


def augment_to_box(digit: np.ndarray, rng: random.Random) -> np.ndarray:
    """Turn a clean 28x28 dataset digit into a plausible ink map of a written box."""
    img = digit.astype(np.float32) / 255.0

    # Stroke weight, pen to felt tip
    k = rng.choice([0, 0, 1, 1, 2])
    if k == 1:
        img = ndimage.grey_dilation(img, size=(2, 2))
    elif k == 2:
        img = ndimage.grey_dilation(img, size=(3, 3))
    elif rng.random() < 0.2:
        img = ndimage.grey_erosion(img, size=(2, 2))

    # Slant, rotation, and aspect, as an affine transform about the centre
    angle = math.radians(rng.uniform(-12, 12))
    shear = rng.uniform(-0.35, 0.35)
    sx = rng.uniform(0.75, 1.15)
    sy = rng.uniform(0.9, 1.1)
    a = np.array([[math.cos(angle), -math.sin(angle)], [math.sin(angle), math.cos(angle)]]) @ np.array(
        [[sx, shear], [0, sy]]
    )
    inv = np.linalg.inv(a)
    c = np.array([13.5, 13.5])
    img = ndimage.affine_transform(img, inv, offset=c - inv @ c, order=1, mode="constant")

    # Place it in a box-sized canvas at a random size and position
    canvas = np.zeros((BOX_PX, BOX_PX), dtype=np.float32)
    size = rng.randint(22, 40)
    scaled = bilinear_resize(img, size, size)
    oy = rng.randint(-6, BOX_PX - size + 6)
    ox = rng.randint(-6, BOX_PX - size + 6)
    paste(canvas, scaled.astype(np.float32), oy, ox, lambda d, s: np.maximum(d, s, out=d))

    # Leftover box-edge fragments that dropout didn't fully remove
    if rng.random() < 0.15:
        edge = rng.choice(["top", "bottom", "left", "right"])
        strength = rng.uniform(0.15, 0.5)
        lo, hi = sorted(rng.sample(range(BOX_PX), 2))
        if edge == "top":
            canvas[0, lo:hi] = np.maximum(canvas[0, lo:hi], strength)
        elif edge == "bottom":
            canvas[-1, lo:hi] = np.maximum(canvas[-1, lo:hi], strength)
        elif edge == "left":
            canvas[lo:hi, 0] = np.maximum(canvas[lo:hi, 0], strength)
        else:
            canvas[lo:hi, -1] = np.maximum(canvas[lo:hi, -1], strength)

    # Pencil or a fading pen, then blur and sensor noise
    canvas *= rng.uniform(0.55, 1.0)
    if rng.random() < 0.5:
        canvas = ndimage.gaussian_filter(canvas, rng.uniform(0.3, 1.0))
    canvas += np.random.default_rng(rng.randint(0, 2**31)).normal(0, rng.uniform(0, 0.05), canvas.shape)
    canvas = np.clip(canvas, 0, 1)

    # Rescale so full-strength strokes saturate, as the app's ink mapping does
    peak = canvas.max()
    if peak > 0:
        canvas = np.clip(canvas / max(peak, 0.6), 0, 1)
    return canvas


class AugmentedDigits(Dataset):
    """A digit dataset where every read produces a freshly augmented, normalized sample."""

    def __init__(self, images: np.ndarray, labels: np.ndarray, seed: int | None = None, augment: bool = True):
        self.images = images
        self.labels = labels
        self.seed = seed
        self.augment = augment

    def __len__(self) -> int:
        return len(self.images)

    def __getitem__(self, i: int):
        rng = random.Random(None if self.seed is None else self.seed * 1_000_003 + i)
        img = self.images[i]
        ink = augment_to_box(img, rng) if self.augment else img.astype(np.float32) / 255.0
        x = normalize(ink)
        return torch.from_numpy(x)[None], int(self.labels[i])


class DigitNet(nn.Module):
    """A small CNN for one 28x28 digit. Kept under 500 KB so it loads instantly."""

    def __init__(self):
        super().__init__()
        self.c1 = nn.Conv2d(1, 24, 3, padding=1)
        self.b1 = nn.BatchNorm2d(24)
        self.c2 = nn.Conv2d(24, 24, 3, padding=1)
        self.b2 = nn.BatchNorm2d(24)
        self.c3 = nn.Conv2d(24, 48, 3, padding=1)
        self.b3 = nn.BatchNorm2d(48)
        self.c4 = nn.Conv2d(48, 48, 3, padding=1)
        self.b4 = nn.BatchNorm2d(48)
        self.c5 = nn.Conv2d(48, 48, 3, stride=2, padding=1)
        self.b5 = nn.BatchNorm2d(48)
        self.drop = nn.Dropout(0.3)
        self.fc1 = nn.Linear(48 * 4 * 4, 64)
        self.fc2 = nn.Linear(64, 10)

    def forward(self, x):
        x = F.relu(self.b1(self.c1(x)))
        x = F.max_pool2d(F.relu(self.b2(self.c2(x))), 2)
        x = F.relu(self.b3(self.c3(x)))
        x = F.max_pool2d(F.relu(self.b4(self.c4(x))), 2)
        x = F.relu(self.b5(self.c5(x)))
        x = self.drop(torch.flatten(x, 1))
        return self.fc2(self.drop(F.relu(self.fc1(x))))


def load(dataset: str):
    """Train and test images and labels, as uint8 arrays with white ink on black."""
    if dataset == "emnist":
        train = datasets.EMNIST(DATA, split="digits", train=True, download=True)
        test = datasets.EMNIST(DATA, split="digits", train=False, download=True)
        # EMNIST images are stored transposed
        fix = lambda d: d.data.numpy().transpose(0, 2, 1)
    else:
        train = datasets.MNIST(DATA, train=True, download=True)
        test = datasets.MNIST(DATA, train=False, download=True)
        fix = lambda d: d.data.numpy()
    return fix(train), train.targets.numpy(), fix(test), test.targets.numpy()


def evaluate(model, loader, device) -> float:
    model.eval()
    correct = total = 0
    with torch.no_grad():
        for x, y in loader:
            pred = model(x.to(device)).argmax(1).cpu()
            correct += (pred == y).sum().item()
            total += len(y)
    return correct / total


def export_glyphs(images: np.ndarray, labels: np.ndarray, count: int = 2000) -> None:
    """Write held-out test-split digits as a sprite sheet for the fixture generator."""
    out_dir = ROOT / "tests" / "fixtures" / "glyphs"
    out_dir.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(7)
    idx = rng.choice(len(images), size=count, replace=False)
    per_row = 50
    sheet = np.zeros((math.ceil(count / per_row) * 28, per_row * 28), dtype=np.uint8)
    for n, i in enumerate(idx):
        r, c = divmod(n, per_row)
        sheet[r * 28 : (r + 1) * 28, c * 28 : (c + 1) * 28] = images[i]
    Image.fromarray(sheet).save(out_dir / "digits.png")
    (out_dir / "digits.json").write_text(
        json.dumps({"cell": 28, "perRow": per_row, "labels": [int(labels[i]) for i in idx]}) + "\n"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=6)
    parser.add_argument("--dataset", choices=["emnist", "mnist"], default="emnist")
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()

    torch.manual_seed(0)
    random.seed(0)
    try:
        xtr, ytr, xte, yte = load(args.dataset)
        dataset = args.dataset
    except Exception as e:  # EMNIST's host is sometimes unavailable
        print(f"could not load {args.dataset} ({e}), falling back to mnist")
        xtr, ytr, xte, yte = load("mnist")
        dataset = "mnist"
    print(f"{dataset}: {len(xtr)} train, {len(xte)} test")

    export_glyphs(xte, yte)

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model = DigitNet().to(device)
    params = sum(p.numel() for p in model.parameters())
    print(f"model: {params} parameters on {device}")

    train_loader = DataLoader(
        AugmentedDigits(xtr, ytr), batch_size=256, shuffle=True, num_workers=args.workers, persistent_workers=True
    )
    test_aug = DataLoader(AugmentedDigits(xte, yte, seed=1), batch_size=512, num_workers=args.workers)
    opt = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=3e-3, total_steps=args.epochs * len(train_loader))

    for epoch in range(args.epochs):
        model.train()
        seen = loss_sum = 0
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            loss = F.cross_entropy(model(x), y, label_smoothing=0.05)
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
            loss_sum += loss.item() * len(y)
            seen += len(y)
        acc = evaluate(model, test_aug, device)
        print(f"epoch {epoch + 1}: loss {loss_sum / seen:.4f}, held-out augmented accuracy {acc:.4f}", flush=True)

    clean_acc = evaluate(model, DataLoader(AugmentedDigits(xte, yte, augment=False), batch_size=512), device)
    aug_acc = evaluate(model, test_aug, device)
    print(f"final: held-out augmented {aug_acc:.4f}, held-out clean {clean_acc:.4f}")

    model.eval().cpu()
    out = ROOT / "public" / "models"
    out.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        torch.zeros(1, 1, OUT, OUT),
        out / "digits.onnx",
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )
    size = (out / "digits.onnx").stat().st_size
    (out / "digits.json").write_text(
        json.dumps(
            {
                "dataset": dataset,
                "epochs": args.epochs,
                "parameters": params,
                "bytes": size,
                "heldOutAugmentedAccuracy": round(aug_acc, 4),
                "heldOutCleanAccuracy": round(clean_acc, 4),
                "input": {"shape": [1, OUT, OUT], "range": [0, 1], "inkIsHigh": True},
            },
            indent=2,
        )
        + "\n"
    )
    print(f"wrote {out / 'digits.onnx'} ({size} bytes)")


if __name__ == "__main__":
    main()
