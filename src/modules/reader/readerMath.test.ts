import { describe, expect, it } from "vitest";

import {
  MAX_SCALE,
  MIN_SCALE,
  actionForKey,
  clampPage,
  clampSpread,
  currentPage,
  pageOfSpread,
  spreadCount,
  spreadForKey,
  spreadOfPage,
  spreadPages,
  zoomIn,
  zoomOut,
} from "./readerMath";

describe("clampPage", () => {
  it("keeps a page inside 1..count", () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(11, 10)).toBe(10);
    expect(clampPage(4.6, 10)).toBe(5);
    expect(clampPage(NaN, 10)).toBe(1);
    expect(clampPage(3, 0)).toBe(1);
  });
});

describe("zoom", () => {
  it("steps and stops at the limits", () => {
    expect(zoomIn(1)).toBe(1.25);
    expect(zoomOut(1)).toBe(0.75);
    expect(zoomIn(MAX_SCALE)).toBe(MAX_SCALE);
    expect(zoomOut(MIN_SCALE)).toBe(MIN_SCALE);
  });

  it("snaps an off-step scale back onto the grid", () => {
    expect(zoomIn(1.3)).toBe(1.5);
    expect(zoomOut(1.3)).toBe(1);
  });
});

describe("currentPage", () => {
  it("picks the page with the most visible pixels, earlier page on a tie", () => {
    expect(currentPage([{ page: 3, visiblePixels: 100 }, { page: 4, visiblePixels: 300 }])).toBe(4);
    expect(currentPage([{ page: 5, visiblePixels: 200 }, { page: 4, visiblePixels: 200 }])).toBe(4);
  });

  it("ignores pages that are not visible and returns null when none is", () => {
    expect(currentPage([{ page: 1, visiblePixels: 0 }])).toBeNull();
    expect(currentPage([])).toBeNull();
  });
});

describe("actionForKey", () => {
  it("maps page keys and clamps at the ends", () => {
    expect(actionForKey("ArrowRight", 3, 10)).toEqual({ type: "page", page: 4 });
    expect(actionForKey("PageDown", 10, 10)).toEqual({ type: "page", page: 10 });
    expect(actionForKey("ArrowLeft", 1, 10)).toEqual({ type: "page", page: 1 });
    expect(actionForKey("PageUp", 5, 10)).toEqual({ type: "page", page: 4 });
    expect(actionForKey("Home", 5, 10)).toEqual({ type: "page", page: 1 });
    expect(actionForKey("End", 5, 10)).toEqual({ type: "page", page: 10 });
  });

  it("maps zoom and close, and leaves scrolling keys alone", () => {
    expect(actionForKey("+", 1, 1)).toEqual({ type: "zoom", direction: "in" });
    expect(actionForKey("-", 1, 1)).toEqual({ type: "zoom", direction: "out" });
    expect(actionForKey("Escape", 1, 1)).toEqual({ type: "close" });
    expect(actionForKey("ArrowDown", 1, 5)).toBeNull();
    expect(actionForKey("ArrowUp", 1, 5)).toBeNull();
  });
});

describe("spreads", () => {
  it("counts spreads: page 1 alone, then pairs", () => {
    expect(spreadCount(1)).toBe(1);
    expect(spreadCount(2)).toBe(2);
    expect(spreadCount(3)).toBe(2);
    expect(spreadCount(600)).toBe(301);
  });

  it("puts page 1 on the right of the first spread", () => {
    expect(spreadPages(0, 10)).toEqual({ left: null, right: 1 });
    expect(spreadPages(1, 10)).toEqual({ left: 2, right: 3 });
    expect(spreadPages(5, 10)).toEqual({ left: 10, right: null });
  });

  it("leaves a side blank when the book ends on an even or odd page", () => {
    expect(spreadPages(1, 2)).toEqual({ left: 2, right: null });
    expect(spreadPages(1, 3)).toEqual({ left: 2, right: 3 });
    expect(spreadPages(0, 1)).toEqual({ left: null, right: 1 });
  });

  it("covers every page exactly once", () => {
    for (const count of [1, 2, 3, 10, 11]) {
      const seen: number[] = [];
      for (let s = 0; s < spreadCount(count); s++) {
        const { left, right } = spreadPages(s, count);
        if (left) seen.push(left);
        if (right) seen.push(right);
      }
      expect(seen).toEqual(Array.from({ length: count }, (_, index) => index + 1));
    }
  });

  it("finds the spread of a page and saves a page that maps back to it", () => {
    expect(spreadOfPage(1, 10)).toBe(0);
    expect(spreadOfPage(2, 10)).toBe(1);
    expect(spreadOfPage(3, 10)).toBe(1);
    expect(spreadOfPage(10, 10)).toBe(5);
    expect(spreadOfPage(99, 10)).toBe(5);
    for (const count of [1, 2, 9, 10, 600]) {
      for (let s = 0; s < spreadCount(count); s++) {
        expect(spreadOfPage(pageOfSpread(s, count), count)).toBe(s);
      }
    }
  });

  it("clamps spreads and maps navigation keys", () => {
    expect(clampSpread(-3, 10)).toBe(0);
    expect(clampSpread(99, 10)).toBe(5);
    expect(clampSpread(NaN, 10)).toBe(0);
    expect(spreadForKey("ArrowRight", 2, 10)).toBe(3);
    expect(spreadForKey("ArrowRight", 5, 10)).toBe(5);
    expect(spreadForKey("PageUp", 0, 10)).toBe(0);
    expect(spreadForKey("End", 0, 10)).toBe(5);
    expect(spreadForKey("Home", 4, 10)).toBe(0);
    expect(spreadForKey("ArrowDown", 4, 10)).toBeNull();
  });
});
