import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * Local pdf.js preview (architecture.md §3.2, §7.5): no external viewer, bytes passed in memory.
 * The worker script is bundled and started during bootstrap, BEFORE any personal data is entered,
 * so no code is loaded lazily after input. Font faces are disabled (glyphs are drawn as paths),
 * so no font loading or standard-font fetch is needed under `font-src 'self'` / `connect-src data:`.
 */
let ready = false;

export function preparePdfRenderer(): void {
  if (ready) return;
  GlobalWorkerOptions.workerPort = new Worker(new URL(workerUrl, import.meta.url), { type: 'module' });
  ready = true;
}

export function isPdfRendererReady(): boolean {
  return ready;
}

/** Renders page 1 into the canvas. Returns false if the render did not complete. */
export async function renderFirstPage(bytes: Uint8Array, canvas: HTMLCanvasElement, cssWidth: number): Promise<boolean> {
  if (!ready) return false;
  const task = getDocument({
    data: bytes.slice(),
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
    useWasm: false,
    stopAtErrors: true,
  });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = (cssWidth / base.width) * (window.devicePixelRatio || 1);
    const viewport = page.getViewport({ scale });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${cssWidth}px`;
    await page.render({ canvas, viewport }).promise;
    return true;
  } catch {
    return false;
  } finally {
    await task.destroy();
  }
}

/** Best-effort clear of a preview canvas (not a guarantee of memory erasure). */
export function clearCanvas(canvas: HTMLCanvasElement | null): void {
  if (canvas === null) return;
  canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
}
