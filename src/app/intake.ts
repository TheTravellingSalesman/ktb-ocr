/**
 * Turning dropped files into cards.
 *
 * Each image is one card and each PDF page is one card. Card IDs come from a
 * hash of the file's bytes, so adding the same file twice is caught and
 * re-exports stay identical.
 */
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

/** PDF pages are rendered at about 200 dpi, plenty for the 6 px/mm the reader uses */
const PDF_SCALE = 200 / 72;

/**
 * One card image ready to add to the batch.
 *
 * Attributes
 * ----------
 * id : str
 *     Hash of the source file plus page number, e.g. "3f9a1c0e2b7d4a61-p0".
 * sourceName : str
 * image : Blob
 *     The image as added, or a rendered PDF page.
 */
export interface IntakeCard {
  id: string;
  sourceName: string;
  image: Blob;
}

/** A file that couldn't be added, with why */
export interface IntakeProblem {
  name: string;
  message: string;
}

const IMAGE_EXT = /\.(jpe?g|png|heic|heif|webp)$/i;

async function hash(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function pdfPages(file: File, bytes: ArrayBuffer, h: string): Promise<IntakeCard[]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const cards: IntakeCard[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: PDF_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("render failed"))), "image/png"));
    cards.push({ id: `${h}-p${n - 1}`, sourceName: doc.numPages > 1 ? `${file.name} (page ${n})` : file.name, image: blob });
  }
  await doc.loadingTask.destroy();
  return cards;
}

/**
 * Read dropped or picked files into cards.
 *
 * Images are test-decoded, so a format this browser can't open (HEIC
 * outside Safari, for example) is reported now rather than failing later.
 *
 * Returns
 * -------
 * The cards to add, and a problem for each file that couldn't be added.
 */
export async function readFiles(files: File[]): Promise<{ cards: IntakeCard[]; problems: IntakeProblem[] }> {
  const cards: IntakeCard[] = [];
  const problems: IntakeProblem[] = [];
  for (const file of files) {
    try {
      const bytes = await file.arrayBuffer();
      const h = await hash(bytes);
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        cards.push(...(await pdfPages(file, bytes, h)));
      } else if (file.type.startsWith("image/") || IMAGE_EXT.test(file.name)) {
        try {
          (await createImageBitmap(file)).close();
        } catch {
          problems.push({ name: file.name, message: "This browser can't open this image format. Try saving it as JPEG." });
          continue;
        }
        cards.push({ id: `${h}-p0`, sourceName: file.name, image: file });
      } else {
        problems.push({ name: file.name, message: "Not a supported image or PDF." });
      }
    } catch (e) {
      problems.push({ name: file.name, message: `Couldn't be read: ${e instanceof Error ? e.message : e}` });
    }
  }
  return { cards, problems };
}
