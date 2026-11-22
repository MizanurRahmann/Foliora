import { describe, expect, it } from "vitest";

import type { ShelfData, ShelfItem } from "../types";
import { canMoveTo, moveTargets, swapPartners } from "./moves";

const item = (id: number, start: number, span: number, isBook = true): ShelfItem => ({
  id,
  start,
  span,
  book: isBook ? ({ id, title: `Book ${id}` } as ShelfItem["book"]) : null,
  decorationId: isBook ? null : id,
});

const shelf = (id: number, capacity: number, items: ShelfItem[]): ShelfData => ({
  id,
  name: `Shelf ${id}`,
  capacity,
  sortOrder: id,
  items,
});

describe("moveTargets", () => {
  it("lists free starts and leaves out the current place and blocked slots", () => {
    const shelves = [shelf(1, 6, [item(1, 1, 1), item(2, 4, 2)])];
    expect(moveTargets(shelves, 1)).toEqual([{ shelf: shelves[0], starts: [2, 3, 6] }]);
  });

  it("lets a wide item overlap its own old place", () => {
    const shelves = [shelf(1, 6, [item(1, 2, 3)])];
    expect(moveTargets(shelves, 1)[0].starts).toEqual([1, 3, 4]);
  });

  it("skips shelves with no valid start and keeps shelf order", () => {
    const shelves = [
      shelf(1, 2, [item(1, 1, 2)]),
      shelf(2, 1, [item(2, 1, 1)]),
      shelf(3, 3, []),
    ];
    const targets = moveTargets(shelves, 1);
    expect(targets.map((t) => t.shelf.id)).toEqual([3]);
    expect(targets[0].starts).toEqual([1, 2]);
  });

  it("never offers space occupied by a decoration", () => {
    const shelves = [shelf(1, 5, [item(1, 1, 1), item(2, 3, 1, false)])];
    expect(moveTargets(shelves, 1)[0].starts).toEqual([2, 4, 5]);
  });

  it("is empty for an unknown item", () => {
    expect(moveTargets([shelf(1, 3, [])], 9)).toEqual([]);
  });
});

describe("canMoveTo", () => {
  const shelves = [shelf(1, 5, [item(1, 1, 2), item(2, 4, 1)])];
  it("checks bounds and overlaps", () => {
    const [s] = shelves;
    expect(canMoveTo(s, s.items[0], 2)).toBe(true);
    expect(canMoveTo(s, s.items[0], 3)).toBe(false);
    expect(canMoveTo(s, s.items[0], 5)).toBe(false);
    expect(canMoveTo(s, s.items[0], 0)).toBe(false);
  });
});

describe("swapPartners", () => {
  it("lists books across shelves but never decorations or the book itself", () => {
    const shelves = [
      shelf(1, 6, [item(1, 1, 1), item(2, 2, 1)]),
      shelf(2, 3, [item(3, 1, 1)]),
      shelf(3, 4, [item(5, 1, 1, false)]),
    ];
    expect(swapPartners(shelves, 1).map((p) => p.id)).toEqual([2, 3]);
  });

  it("excludes a partner that would not fit", () => {
    const shelves = [
      shelf(1, 3, [item(1, 1, 1), item(2, 2, 1)]),
      shelf(2, 3, [item(3, 1, 3)]),
    ];
    expect(swapPartners(shelves, 1).map((p) => p.id)).toEqual([2]);
  });
});
