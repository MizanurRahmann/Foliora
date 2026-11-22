// Pure helpers for the reader, kept apart so they can be tested without a PDF or a DOM.

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 3;
export const SCALE_STEP = 0.25;
export const DEFAULT_SCALE = 1.25;

export function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(Math.round(page), 1), Math.max(pageCount, 1));
}

export function clampScale(scale: number): number {
  return Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
}

export function zoomIn(scale: number): number {
  return clampScale(Math.round((scale + SCALE_STEP) / SCALE_STEP) * SCALE_STEP);
}

export function zoomOut(scale: number): number {
  return clampScale(Math.round((scale - SCALE_STEP) / SCALE_STEP) * SCALE_STEP);
}

export interface PageVisibility {
  page: number;
  visiblePixels: number;
}

// The page that takes up most of the view. A tie goes to the earlier page.
export function currentPage(visibility: Iterable<PageVisibility>): number | null {
  let best: PageVisibility | null = null;
  for (const entry of visibility) {
    if (entry.visiblePixels <= 0) continue;
    if (!best || entry.visiblePixels > best.visiblePixels || (entry.visiblePixels === best.visiblePixels && entry.page < best.page)) {
      best = entry;
    }
  }
  return best?.page ?? null;
}

// The keys that turn pages or change the zoom. Arrow Up and Down are left to the browser to scroll.
export type ReaderKeyAction =
  | { type: "page"; page: number }
  | { type: "zoom"; direction: "in" | "out" }
  | { type: "close" };

export function actionForKey(key: string, page: number, pageCount: number): ReaderKeyAction | null {
  switch (key) {
    case "Escape":
      return { type: "close" };
    case "ArrowRight":
    case "PageDown":
      return { type: "page", page: clampPage(page + 1, pageCount) };
    case "ArrowLeft":
    case "PageUp":
      return { type: "page", page: clampPage(page - 1, pageCount) };
    case "Home":
      return { type: "page", page: 1 };
    case "End":
      return { type: "page", page: Math.max(pageCount, 1) };
    case "+":
    case "=":
      return { type: "zoom", direction: "in" };
    case "-":
    case "_":
      return { type: "zoom", direction: "out" };
    default:
      return null;
  }
}

// Spreads. Page 1 sits alone on the right, as it does when a real book is first opened; after that
// pages come in pairs (2-3, 4-5, ...). Spread 0 is the first.

export const spreadCount = (pageCount: number): number => Math.floor(Math.max(pageCount, 1) / 2) + 1;

export function clampSpread(spread: number, pageCount: number): number {
  if (!Number.isFinite(spread)) return 0;
  return Math.min(Math.max(Math.round(spread), 0), spreadCount(pageCount) - 1);
}

export const spreadOfPage = (page: number, pageCount: number): number =>
  clampSpread(Math.floor(clampPage(page, pageCount) / 2), pageCount);

// The pages on each side of a spread; null where there is no page (before the first or after the last).
export function spreadPages(spread: number, pageCount: number): { left: number | null; right: number | null } {
  const left = spread >= 1 ? spread * 2 : null;
  const right = spread * 2 + 1;
  return {
    left: left !== null && left <= pageCount ? left : null,
    right: right <= pageCount ? right : null,
  };
}

// The page saved as "last read" for a spread.
export const pageOfSpread = (spread: number, pageCount: number): number =>
  clampPage(spread * 2 + 1, pageCount);

// Keys that move between spreads. Returns the spread to go to, or null if the key is not one of them.
export function spreadForKey(key: string, spread: number, pageCount: number): number | null {
  switch (key) {
    case "ArrowRight":
    case "PageDown":
      return clampSpread(spread + 1, pageCount);
    case "ArrowLeft":
    case "PageUp":
      return clampSpread(spread - 1, pageCount);
    case "Home":
      return 0;
    case "End":
      return spreadCount(pageCount) - 1;
    default:
      return null;
  }
}
