/**
 * Showing card images: object URLs, field crops, and the full-card view.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import type { CardLayout, Rect } from "../cards/schema";
import { PX_PER_MM } from "../core/raster";
import type { ReviewItem } from "../app/review";

/** An object URL for a blob, revoked when the blob changes or the component unmounts */
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

const bitmaps = new Map<Blob, Promise<ImageBitmap>>();

/** A decoded image, shared by every crop of the same card */
function bitmapOf(blob: Blob): Promise<ImageBitmap> {
  if (!bitmaps.has(blob)) {
    if (bitmaps.size > 8) bitmaps.delete(bitmaps.keys().next().value!);
    bitmaps.set(blob, createImageBitmap(blob));
  }
  return bitmaps.get(blob)!;
}

/** The region of the aligned card a review item covers, in mm, with a little context */
export function itemRegion(item: ReviewItem, layout: CardLayout): Rect {
  const pad = 1;
  let rects: Rect[];
  if (item.kind === "category") {
    const name = layout.fields.find((f) => f.id === `other.${item.row}.name`);
    const count = layout.fields.find((f) => f.id === `other.${item.row}.count`);
    rects = [name?.kind === "text" ? name.textRect : null, count?.kind === "number" ? count.boxes[count.boxes.length - 1] : null].filter(Boolean) as Rect[];
  } else if (item.field.kind === "text") {
    rects = [item.field.textRect];
  } else {
    const f = item.field;
    rects = [...f.boxes, f.tallyRect ?? f.labelRect];
  }
  const x0 = Math.min(...rects.map((r) => r.x)) - pad;
  const y0 = Math.min(...rects.map((r) => r.y)) - pad;
  const x1 = Math.max(...rects.map((r) => r.x + r.w)) + pad;
  const y1 = Math.max(...rects.map((r) => r.y + r.h)) + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A crop of the aligned card around one review item */
export function FieldCrop({ aligned, region, label }: { aligned: Blob; region: Rect; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    bitmapOf(aligned).then((bmp) => {
      const c = canvas.current;
      if (!live || !c) return;
      const sx = region.x * PX_PER_MM;
      const sy = region.y * PX_PER_MM;
      const sw = region.w * PX_PER_MM;
      const sh = region.h * PX_PER_MM;
      c.width = Math.round(sw);
      c.height = Math.round(sh);
      c.getContext("2d")!.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
    });
    return () => {
      live = false;
    };
  }, [aligned, region.x, region.y, region.w, region.h]);
  return <canvas ref={canvas} class="crop" role="img" aria-label={`Image of ${label}`} style={{ aspectRatio: `${region.w} / ${region.h}` }} />;
}

/** The whole card, with the region being reviewed highlighted */
export function FullCard({ image, layout, highlight, aligned }: { image: Blob; layout: CardLayout; highlight?: Rect; aligned: boolean }) {
  const url = useObjectUrl(image);
  const { width, height } = layout.page;
  return (
    <div class="fullcard" data-testid="full-card">
      {url && <img src={url} alt={aligned ? "The whole card, straightened" : "The card image as added"} />}
      {aligned && highlight && (
        <div
          class="highlight"
          data-testid="highlight"
          style={{
            left: `${(highlight.x / width) * 100}%`,
            top: `${(highlight.y / height) * 100}%`,
            width: `${(highlight.w / width) * 100}%`,
            height: `${(highlight.h / height) * 100}%`,
          }}
        />
      )}
    </div>
  );
}
