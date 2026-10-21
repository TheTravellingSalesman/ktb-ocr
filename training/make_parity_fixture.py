"""Write inputs and expected outputs of `normalize` for the TypeScript parity test.

Usage: uv run python make_parity_fixture.py
"""

import json
import random

import numpy as np

from train_digits import ROOT, augment_to_box, normalize

rng = random.Random(3)
gen = np.random.default_rng(3)
cases = []
for i in range(12):
    digit = np.zeros((28, 28), dtype=np.uint8)
    # Random strokes stand in for a digit
    for _ in range(rng.randint(1, 3)):
        y0, x0, y1, x1 = (rng.randint(4, 24) for _ in range(4))
        for t in np.linspace(0, 1, 40):
            digit[int(y0 + (y1 - y0) * t), int(x0 + (x1 - x0) * t)] = 255
    ink = augment_to_box(digit, rng).astype(np.float32)
    # Odd sizes exercise rounding in the resize
    if i % 3 == 1:
        ink = ink[:, : 32 - i]
    cases.append({"width": ink.shape[1], "height": ink.shape[0], "ink": [round(float(v), 6) for v in ink.ravel()], "expected": [round(float(v), 6) for v in normalize(ink).ravel()]})
out = ROOT / "tests" / "fixtures" / "digitprep-parity.json"
out.write_text(json.dumps(cases) + "\n")
print(f"wrote {len(cases)} cases to {out}")
