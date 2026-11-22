import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import PageView from "./PageView";
import { currentPage } from "./readerMath";

export interface SingleViewHandle {
  goTo: (page: number) => void;
}

interface SinglePageViewProps {
  pdf: PDFDocumentProxy;
  baseSize: { width: number; height: number };
  scale: number;
  initialPage: number;
  onPageChange: (page: number) => void;
}

const noop = () => undefined;

// The continuous, scrolling view of the whole document: one page after another.
const SinglePageView = forwardRef<SingleViewHandle, SinglePageViewProps>(function SinglePageView(
  { pdf, baseSize, scale, initialPage, onPageChange },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef(initialPage);
  const hasRestoredRef = useRef(false);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  const scrollToPage = useCallback((target: number) => {
    scrollRef.current?.querySelector<HTMLElement>(`[data-page="${target}"]`)?.scrollIntoView({ block: "start" });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      goTo: (page) => {
        pageRef.current = page;
        scrollToPage(page);
        onPageChangeRef.current(page);
      },
    }),
    [scrollToPage],
  );

  // Open on the requested page before the tracker below starts reporting.
  useLayoutEffect(() => {
    scrollToPage(pageRef.current);
    hasRestoredRef.current = true;
    scrollRef.current?.focus({ preventScroll: true });
  }, [scrollToPage]);

  // Follow the scroll position to know which page is being read.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const visible = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const number = Number((entry.target as HTMLElement).dataset.page);
          visible.set(number, entry.isIntersecting ? entry.intersectionRect.height : 0);
        }
        if (!hasRestoredRef.current) return;
        const current = currentPage([...visible].map(([page, visiblePixels]) => ({ page, visiblePixels })));
        if (current !== null && current !== pageRef.current) {
          pageRef.current = current;
          onPageChangeRef.current(current);
        }
      },
      { root, threshold: Array.from({ length: 21 }, (_, index) => index / 20) },
    );
    root.querySelectorAll("[data-page]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [pdf]);

  // Keep the current page in view when the zoom changes the page heights.
  const previousScale = useRef(scale);
  useLayoutEffect(() => {
    if (previousScale.current === scale) return;
    previousScale.current = scale;
    scrollToPage(pageRef.current);
  }, [scale, scrollToPage]);

  return (
    <div ref={scrollRef} className="reader__pages" tabIndex={-1}>
      {Array.from({ length: pdf.numPages }, (_, index) => index + 1).map((pageNumber) => (
        <PageView
          key={pageNumber}
          pdf={pdf}
          pageNumber={pageNumber}
          scale={scale}
          baseSize={baseSize}
          scrollRootRef={scrollRef}
          onRendered={noop}
        />
      ))}
    </div>
  );
});

export default SinglePageView;
