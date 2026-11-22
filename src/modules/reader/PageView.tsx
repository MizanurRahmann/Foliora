import { useEffect, useRef, useState, type RefObject } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

interface PageViewProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  // Size of a page at scale 1, used until this page's own size is known.
  baseSize: { width: number; height: number };
  scrollRootRef: RefObject<HTMLElement | null>;
  onRendered: (pageNumber: number) => void;
}

// How far outside the view a page is still kept rendered.
const RENDER_MARGIN = "120% 0px";

// A page that draws itself only when it is near the view, and gives its memory back when it is far.
function PageView({ pdf, pageNumber, scale, baseSize, scrollRootRef, onRendered }: PageViewProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isNear, setIsNear] = useState(false);
  const [ownSize, setOwnSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const observer = new IntersectionObserver(([entry]) => setIsNear(entry.isIntersecting), {
      root: scrollRootRef.current,
      rootMargin: RENDER_MARGIN,
    });
    observer.observe(holder);
    return () => observer.disconnect();
  }, [scrollRootRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!isNear || !canvas) return;

    let cancelled = false;
    let task: RenderTask | null = null;

    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const unit = page.getViewport({ scale: 1 });
        setOwnSize({ width: unit.width, height: unit.height });

        const viewport = page.getViewport({ scale });
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const context = canvas.getContext("2d");
        if (!context) return;
        task = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        await task.promise;
        if (!cancelled) onRendered(pageNumber);
      } catch {
        // A cancelled render rejects; a page that fails to draw stays blank.
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
      // Shrinking the canvas frees its pixel memory while the page is far away.
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [isNear, pdf, pageNumber, scale, onRendered]);

  const size = ownSize ?? baseSize;
  return (
    <div
      ref={holderRef}
      className="reader__page"
      data-page={pageNumber}
      style={{ width: Math.floor(size.width * scale), height: Math.floor(size.height * scale) }}
    >
      <canvas ref={canvasRef} aria-label={`Page ${pageNumber}`} />
    </div>
  );
}

export default PageView;
