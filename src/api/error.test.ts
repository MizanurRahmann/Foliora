import { describe, expect, it } from "vitest";

import { AppError, toAppError } from "./error";

describe("toAppError", () => {
  it("reads the payload sent by the backend", () => {
    const err = toAppError({ code: "SHELF_NOT_EMPTY", message: "Not empty", details: { itemCount: 2 } });
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("SHELF_NOT_EMPTY");
    expect(err.message).toBe("Not empty");
    expect(err.details).toEqual({ itemCount: 2 });
  });

  it("keeps an AppError as it is", () => {
    const original = new AppError("X", "y");
    expect(toAppError(original)).toBe(original);
  });

  it("wraps other errors", () => {
    const err = toAppError(new TypeError("no backend"));
    expect(err.code).toBe("UNKNOWN");
    expect(err.message).toBe("no backend");
  });

  it("wraps plain values", () => {
    expect(toAppError("boom").message).toBe("boom");
    expect(toAppError({ code: 5 }).code).toBe("UNKNOWN");
  });
});
