import { describe, expect, it } from "vitest";

import { moveId } from "./reorder";

describe("moveId", () => {
  it("moves an entry up", () => {
    expect(moveId([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
  });

  it("moves an entry down", () => {
    expect(moveId([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
  });

  it("leaves the order alone at either end", () => {
    expect(moveId([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveId([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });

  it("does not modify its input", () => {
    const ids = [1, 2, 3];
    moveId(ids, 0, 1);
    expect(ids).toEqual([1, 2, 3]);
  });
});
