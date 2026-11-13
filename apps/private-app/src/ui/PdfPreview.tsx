import { useEffect, useRef, useState } from 'react';
import { clearCanvas, renderFirstPage } from '../bootstrap/pdfRenderer.ts';

interface Props {
  bytes: Uint8Array;
}

/** Page-1 preview of the generated PDF, drawn locally with pdf.js. Cleared when unmounted. */
export function PdfPreview({ bytes }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'rendering' | 'done' | 'failed'>('rendering');

  useEffect(() => {
    let live = true;
    const el = canvas.current;
    if (el === null) return undefined;
    const width = Math.min(720, el.parentElement?.clientWidth ?? 720);
    renderFirstPage(bytes, el, width).then(
      (ok) => {
        if (live) setState(ok ? 'done' : 'failed');
      },
      () => {
        if (live) setState('failed');
      },
    );
    return () => {
      live = false;
      clearCanvas(el);
    };
  }, [bytes]);

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-medium">Preview of page 1</figcaption>
      <div className="overflow-auto rounded-md border bg-white">
        <canvas ref={canvas} data-testid="pdf-preview" data-state={state} aria-label="Preview of the filled form, page 1" role="img" />
      </div>
      {state === 'failed' && <p className="text-sm text-destructive">The preview could not be drawn. You can still save the PDF.</p>}
    </figure>
  );
}
