import { describe, expect, it } from "vitest";

import cases from "../../../tests/placement-cases.json";
import {
  bookSpan,
  canPlace,
  firstFit,
  planSwap,
  type BookSize,
  type Orientation,
  type Placed,
  type ShelfLayout,
  type Slot,
  type SwapPlan,
} from "./placement";

interface SwapCase {
  name: string;
  shelves: ShelfLayout[];
  a: number;
  b: number;
  expect: SwapPlan | null;
}

describe("bookSpan", () => {
  it.each(cases.bookSpan)("$name", (c) => {
    expect(bookSpan(c.size as BookSize, c.orientation as Orientation, c.pages)).toBe(c.expect);
  });
});

describe("canPlace", () => {
  it.each(cases.canPlace)("$name", (c) => {
    const ignore = "ignore" in c ? (c.ignore as number[]) : [];
    expect(canPlace(c.capacity, c.items as Placed[], c.span, c.start, ignore)).toBe(c.expect);
  });
});

describe("firstFit", () => {
  it.each(cases.firstFit)("$name", (c) => {
    expect(firstFit(c.shelves as ShelfLayout[], c.span)).toEqual(c.expect as Slot | null);
  });
});

describe("planSwap", () => {
  it.each(cases.swap as SwapCase[])("$name", (c) => {
    expect(planSwap(c.shelves, c.a, c.b)).toEqual(c.expect);
  });
});
