import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

interface LeafPageProps {
  pdf: PDFDocumentProxy | null;
  // null is a blank page, as before the first page or after the last.
  pageNumber: number | null;
  width: number;
  height: number;
  // Called when the page has been drawn, or has failed to draw, so the caller never waits forever.
  onSettled?: (pageNumber: number) => void;
}

// One page of the open book. It fades in each time the page changes, which is the page turn.
function LeafPage({ pdf, pageNumber, width, height, onSettled }: LeafPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isShown, setIsShown] = useState(false);
  const shownPageRef = useRef<number | null>(null);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // A different page fades out first; a resize of the same page redraws in place.
    if (shownPageRef.current !== pageNumber) {
      shownPageRef.current = pageNumber;
      setIsShown(false);
    }
    if (!pdf || pageNumber === null) return;

    let cancelled = false;
    let task: RenderTask | null = null;

    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const unit = page.getViewport({ scale: 1 });
        // The whole page fits in the box; a page of another shape leaves a margin of paper.
        const fit = Math.min(width / unit.width, height / unit.height);
        const ratio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: fit * ratio });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${viewport.width / ratio}px`;
        canvas.style.height = `${viewport.height / ratio}px`;

        const context = canvas.getContext("2d");
        if (!context) return;
        task = page.render({ canvas, canvasContext: context, viewport });
        await task.promise;
        if (!cancelled) setIsShown(true);
      } catch {
        // A cancelled render rejects. A page that fails to draw stays blank.
      } finally {
        if (!cancelled) onSettledRef.current?.(pageNumber);
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, width, height]);

  // Frees the pixels when the page goes away.
  useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, []);

  return (
    <div className="leaf-page" style={{ width, height }}>
      <canvas
        ref={canvasRef}
        className={`leaf-page__canvas${isShown ? " leaf-page__canvas--shown" : ""}`}
        aria-label={pageNumber === null ? undefined : `Page ${pageNumber}`}
        aria-hidden={pageNumber === null}
      />
    </div>
  );
}

export default LeafPage;
