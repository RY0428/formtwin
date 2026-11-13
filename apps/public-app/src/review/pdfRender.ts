import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/** Local rendering of an approved blank original for review (no external viewer, bytes in memory). */
let started = false;

function ensureWorker(): void {
  if (started) return;
  GlobalWorkerOptions.workerPort = new Worker(new URL(workerUrl, import.meta.url), { type: 'module' });
  started = true;
}

export interface RenderedPage {
  readonly widthPt: number;
  readonly heightPt: number;
}

export async function renderPage(
  bytes: Uint8Array,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
): Promise<RenderedPage | undefined> {
  ensureWorker();
  const task = getDocument({ data: bytes.slice(), disableFontFace: true, useSystemFonts: false, enableXfa: false, useWasm: false });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * (window.devicePixelRatio || 1) });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = '100%';
    await page.render({ canvas, viewport }).promise;
    return { widthPt: base.width, heightPt: base.height };
  } catch {
    return undefined;
  } finally {
    await task.destroy();
  }
}
