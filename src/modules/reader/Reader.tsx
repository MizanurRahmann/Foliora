import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { IoAdd, IoChevronBack, IoChevronForward, IoClose, IoContract, IoExpand, IoRemove } from "react-icons/io5";

import "./Reader.scss";

import { toAppError } from "../../api/error";
import { readBookFile, saveReadingProgress } from "../../api/reader";
import type { BookProblem } from "../shelf/components/bookPanels/BookProblemPanel";
import type { BookSummary } from "../shelf/types";
import { canClose, canNavigate, initialMachine, reduce } from "./bookMachine";
import { FULL_MS, HOLD_T, geometryFor, phaseAt, poseAt, type Geometry } from "./bookPose";
import Book3D, { type Book3DHandle } from "./Book3D";
import LeafPage from "./LeafPage";
import { createPlayer, type Player } from "./player";
import { openPdf } from "./pdf";
import SinglePageView, { type SingleViewHandle } from "./SinglePageView";
import {
  DEFAULT_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  actionForKey,
  clampPage,
  clampSpread,
  pageOfSpread,
  spreadCount,
  spreadForKey,
  spreadOfPage,
  spreadPages,
  zoomIn,
  zoomOut,
} from "./readerMath";

interface ReaderProps {
  book: BookSummary;
  // The book on the shelf that was clicked; the animation starts and ends there.
  origin: HTMLElement;
  onClose: () => void;
  onUnavailable: (problem: BookProblem) => void;
}

type Mode = "spread" | "single";

// Cover width over height. A5 and B5 are both close to this.
const COVER_ASPECT = 0.705;
const SAVE_DELAY_MS = 800;
const MODE_FADE_MS = 240;

// For tuning the animation: localStorage.setItem("foliora.slowmo", "4") in the dev tools makes it 4x slower.
function slowMotionFactor(): number {
  try {
    const value = Number(window.localStorage.getItem("foliora.slowmo"));
    return Number.isFinite(value) && value >= 1 ? Math.min(value, 20) : 1;
  } catch {
    return 1;
  }
}

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function geometryOf(element: HTMLElement, pageCount: number): Geometry {
  const rect = element.getBoundingClientRect();
  return geometryFor(
    { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
    window.innerWidth,
    window.innerHeight,
    COVER_ASPECT,
    pageCount,
  );
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function Reader({ book, origin, onClose, onUnavailable }: ReaderProps) {
  const [machine, dispatch] = useReducer(reduce, initialMachine);
  const machineRef = useRef(machine);
  machineRef.current = machine;

  const [geometry, setGeometry] = useState<Geometry>(() => geometryOf(origin, book.pageCount));
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [baseSize, setBaseSize] = useState({ width: 612, height: 792 });
  const [mode, setMode] = useState<Mode>("spread");
  const [isSingleMounted, setIsSingleMounted] = useState(false);
  const [spread, setSpread] = useState(0);
  const [singlePage, setSinglePage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [pageInput, setPageInput] = useState("1");

  const bookRef = useRef<Book3DHandle>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const singleRef = useRef<SingleViewHandle>(null);
  const playerRef = useRef<Player | null>(null);
  const originRef = useRef(origin);
  const readyRef = useRef<Deferred | null>(null);
  if (!readyRef.current) readyRef.current = deferred();
  const isSettledRef = useRef(false);
  // Set the moment closing starts. React state would lag behind a second click in the same tick.
  const isClosingRef = useRef(false);
  const lastPhaseRef = useRef<string>("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedPageRef = useRef<number | null>(null);
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  const pageCount = pdf?.numPages ?? 0;
  const isReading = machine.state === "reading";
  const currentPage = mode === "spread" ? pageOfSpread(spread, pageCount || 1) : singlePage;
  const { left, right } = spreadPages(spread, pageCount);

  // Poses everything that moves with the timeline: the book, the dimmed room and the shadow beneath it.
  const onFrame = useCallback((time: number) => {
    const g = geometryRef.current;
    const pose = poseAt(time, g);
    bookRef.current?.apply(time >= 1 ? null : pose);

    if (backdropRef.current) backdropRef.current.style.opacity = String(pose.dim);

    const shadow = shadowRef.current;
    if (shadow) {
      const yaw = (pose.ry * Math.PI) / 180;
      const thickness = g.T + (g.Tbook - g.T) * pose.thin;
      const width = pose.k * (thickness * Math.abs(Math.sin(yaw)) + g.D * Math.abs(Math.cos(yaw)));
      shadow.style.width = `${width}px`;
      shadow.style.transform = `translate(${pose.x - width / 2}px, ${pose.y + (pose.k * g.H) / 2 - 8}px)`;
      shadow.style.opacity = String(0.5 * pose.lift);
    }

    const phase = phaseAt(time);
    if (phase !== lastPhaseRef.current) {
      lastPhaseRef.current = phase;
      dispatch({ type: "PHASE", phase });
    }
  }, []);

  // The timeline: lift off the shelf, float, turn, wait for the PDF, open.
  useLayoutEffect(() => {
    const element = originRef.current;
    element.style.visibility = "hidden";

    const player = createPlayer(onFrame, FULL_MS * slowMotionFactor(), prefersReducedMotion());
    playerRef.current = player;
    let cancelled = false;

    // The book starts exactly over its place on the shelf.
    player.jumpTo(0);
    dispatch({ type: "CLICK" });

    void (async () => {
      if (!(await player.playTo(HOLD_T)) || cancelled) return;
      try {
        await readyRef.current?.promise;
      } catch {
        return; // Loading failed; the failure path takes the book back.
      }
      // The reader may have been closed while the book waited for its PDF.
      if (cancelled || isClosingRef.current) return;
      if ((await player.playTo(1)) && !cancelled) dispatch({ type: "ARRIVED" });
    })();

    return () => {
      cancelled = true;
      player.stop();
      originRef.current.style.visibility = "";
    };
  }, [onFrame]);

  // Closing is the same timeline run backwards, down to the book's own place on the shelf.
  const sendHome = useCallback(async (): Promise<boolean> => {
    const player = playerRef.current;
    if (!player) return false;

    // The shelf may have changed behind the reader; return to where the book is now.
    const live = document.querySelector<HTMLElement>(`[data-book-id="${book.id}"]`);
    if (live && live !== originRef.current) {
      originRef.current.style.visibility = "";
      live.style.visibility = "hidden";
      originRef.current = live;
    }
    const next = geometryOf(originRef.current, book.pageCount);
    geometryRef.current = next;
    setGeometry(next);

    return player.playTo(0);
  }, [book.id, book.pageCount]);

  const fail = useCallback(
    async (problem: BookProblem) => {
      if (isClosingRef.current) return;
      isClosingRef.current = true;
      dispatch({ type: "FAIL" });
      readyRef.current?.reject(problem);
      if (await sendHome()) onUnavailableRef.current(problem);
    },
    [sendHome],
  );

  // Load the PDF while the book is still being carried to the middle.
  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;

    void (async () => {
      try {
        const bytes = await readBookFile(book.id);
        task = openPdf(bytes);
        const doc = await task.promise;
        if (cancelled) return;
        const first = await doc.getPage(1);
        if (cancelled) return;
        const unit = first.getViewport({ scale: 1 });
        setBaseSize({ width: unit.width, height: unit.height });

        const start = clampPage(book.lastReadPage, doc.numPages);
        const startSpread = spreadOfPage(start, doc.numPages);
        setSpread(startSpread);
        setSinglePage(start);
        setPageInput(String(pageOfSpread(startSpread, doc.numPages)));
        setPdf(doc);
      } catch (err) {
        if (cancelled) return;
        void fail(toAppError(err).code === "FILE_MISSING" ? "MISSING" : "UNREADABLE");
      }
    })();

    return () => {
      cancelled = true;
      if (task) void task.destroy();
    };
    // The book never changes while the reader is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // The cover opens once the first page is drawn behind it.
  const handleSettled = useCallback(() => {
    if (isSettledRef.current) return;
    isSettledRef.current = true;
    dispatch({ type: "READY" });
    readyRef.current?.resolve();
  }, []);

  const flushProgress = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (savedPageRef.current === currentPageRef.current) return;
    savedPageRef.current = currentPageRef.current;
    await saveReadingProgress(book.id, currentPageRef.current).catch(() => undefined);
  }, [book.id]);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  // Opening the book counts as reading it, which also stamps "last opened". After that, page
  // changes are saved after a short pause so flipping through pages sends one write.
  useEffect(() => {
    if (!isReading || !pdf || savedPageRef.current === currentPage) return;
    const delay = savedPageRef.current === null ? 0 : SAVE_DELAY_MS;
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      savedPageRef.current = currentPage;
      void saveReadingProgress(book.id, currentPage).catch(() => undefined);
    }, delay);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [currentPage, isReading, pdf, book.id]);

  const close = useCallback(async () => {
    if (isClosingRef.current || !canClose(machineRef.current)) return;
    isClosingRef.current = true;
    dispatch({ type: "CLOSE" });
    // Back to the two-page view first, so the book closes from where it opened.
    if (mode === "single") {
      setMode("spread");
      await wait(MODE_FADE_MS);
    }
    await flushProgress();
    if (!(await sendHome())) return;
    dispatch({ type: "CLOSED" });
    onClose();
  }, [mode, flushProgress, sendHome, onClose]);

  const goToSpread = useCallback(
    (next: number) => {
      if (!pdf) return;
      const target = clampSpread(next, pdf.numPages);
      setSpread(target);
      setPageInput(String(pageOfSpread(target, pdf.numPages)));
    },
    [pdf],
  );

  const goToPage = useCallback(
    (page: number) => {
      if (!pdf) return;
      const target = clampPage(page, pdf.numPages);
      if (mode === "spread") goToSpread(spreadOfPage(target, pdf.numPages));
      else singleRef.current?.goTo(target);
      setPageInput(String(target));
    },
    [pdf, mode, goToSpread],
  );

  const step = (direction: 1 | -1) => {
    if (mode === "spread") goToSpread(spread + direction);
    else goToPage(singlePage + direction);
  };

  const toggleMode = () => {
    if (!pdf) return;
    if (mode === "spread") {
      setSinglePage(right ?? left ?? 1);
      setIsSingleMounted(true);
      setMode("single");
    } else {
      const target = spreadOfPage(singlePage, pdf.numPages);
      setSpread(target);
      setPageInput(String(pageOfSpread(target, pdf.numPages)));
      setMode("spread");
    }
  };

  // Let the single-page view fade out before it is removed.
  useEffect(() => {
    if (mode === "single" || !isSingleMounted) return;
    const timer = setTimeout(() => setIsSingleMounted(false), MODE_FADE_MS);
    return () => clearTimeout(timer);
  }, [mode, isSingleMounted]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const isTyping = event.target instanceof HTMLInputElement;
      if (isTyping && event.key !== "Escape") return;

      if (event.key === "Escape") {
        event.preventDefault();
        void close();
        return;
      }
      if (!canNavigate(machineRef.current) || !pdf) return;

      const zoomAction = actionForKey(event.key, currentPageRef.current, pdf.numPages);
      if (zoomAction?.type === "zoom") {
        event.preventDefault();
        const next = (value: number) => (zoomAction.direction === "in" ? zoomIn(value) : zoomOut(value));
        if (mode === "spread") setZoom(next);
        else setScale(next);
        return;
      }

      if (mode === "spread") {
        const target = spreadForKey(event.key, spread, pdf.numPages);
        if (target !== null) {
          event.preventDefault();
          goToSpread(target);
        }
      } else if (zoomAction?.type === "page") {
        event.preventDefault();
        goToPage(zoomAction.page);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pdf, mode, spread, close, goToSpread, goToPage]);

  const zoomValue = mode === "spread" ? zoom : scale;
  const setZoomValue = (fn: (value: number) => number) => (mode === "spread" ? setZoom(fn) : setScale(fn));
  const isFirst = mode === "spread" ? spread <= 0 : singlePage <= 1;
  const isLast = mode === "spread" ? spread >= spreadCount(pageCount) - 1 : singlePage >= pageCount;

  const leafWidth = geometry.D * zoom;
  const leafHeight = geometry.H * zoom;
  const isScrollable = isReading && mode === "spread";
  const tableStyle = {
    minWidth: zoom > 1 ? Math.max(geometry.vw, 2 * leafWidth + 48) : geometry.vw,
    minHeight: zoom > 1 ? Math.max(geometry.vh, leafHeight + 48) : geometry.vh,
  };

  return (
    <div className={`reader reader--${machine.state}`} role="dialog" aria-modal="true" aria-label={`Reading ${book.title}`}>
      <div ref={backdropRef} className="reader__backdrop" />
      <div ref={shadowRef} className="reader__shadow" />

      <div className={`reader__viewport${isScrollable ? " reader__viewport--scroll" : ""}`}>
        <div className="reader__table" style={tableStyle}>
          <Book3D
            ref={bookRef}
            book={book}
            geometry={geometry}
            zoom={zoom}
            left={<LeafPage pdf={pdf} pageNumber={left} width={leafWidth} height={leafHeight} onSettled={handleSettled} />}
            right={<LeafPage pdf={pdf} pageNumber={right} width={leafWidth} height={leafHeight} onSettled={handleSettled} />}
          />
        </div>
      </div>

      {isSingleMounted && pdf && (
        <div className={`reader__single${mode === "single" ? " reader__single--visible" : ""}`}>
          <SinglePageView
            ref={singleRef}
            pdf={pdf}
            baseSize={baseSize}
            scale={scale}
            initialPage={singlePage}
            onPageChange={(page) => {
              setSinglePage(page);
              setPageInput(String(page));
            }}
          />
        </div>
      )}

      <div className={`reader__controls${isReading ? " reader__controls--on" : ""}`}>
        <div className="reader__corner reader__corner--top-left">
          <button type="button" aria-label="Close book" onClick={() => void close()}>
            <IoClose />
          </button>
          <button
            type="button"
            aria-label={mode === "spread" ? "Single-page view" : "Two-page view"}
            title={mode === "spread" ? "Single-page view" : "Two-page view"}
            disabled={!pdf}
            onClick={toggleMode}
          >
            {mode === "spread" ? <IoExpand /> : <IoContract />}
          </button>
        </div>

        <div className="reader__corner reader__corner--top-right">
          <button type="button" aria-label="Zoom out" disabled={zoomValue <= MIN_SCALE} onClick={() => setZoomValue(zoomOut)}>
            <IoRemove />
          </button>
          <span className="reader__zoom" aria-live="polite">
            {Math.round(zoomValue * 100)}%
          </span>
          <button type="button" aria-label="Zoom in" disabled={zoomValue >= MAX_SCALE} onClick={() => setZoomValue(zoomIn)}>
            <IoAdd />
          </button>
          <form
            className="reader__goto"
            onSubmit={(event) => {
              event.preventDefault();
              goToPage(Number(pageInput));
            }}
          >
            <input
              aria-label="Go to page"
              inputMode="numeric"
              value={pageInput}
              disabled={!pdf}
              onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ""))}
              onBlur={() => setPageInput(String(currentPage))}
            />
            <span>/ {pageCount || "–"}</span>
          </form>
        </div>

        <button
          type="button"
          className="reader__turn reader__turn--prev"
          aria-label="Previous page"
          disabled={!pdf || isFirst}
          onClick={() => step(-1)}
        >
          <IoChevronBack />
        </button>
        <button
          type="button"
          className="reader__turn reader__turn--next"
          aria-label="Next page"
          disabled={!pdf || isLast}
          onClick={() => step(1)}
        >
          <IoChevronForward />
        </button>
      </div>
    </div>
  );
}

export default Reader;
