import { describe, expect, it } from "vitest";

import type { BookSummary, ShelfData } from "../types";
import { formatBytes } from "./format";
import { describePlacement, findBook } from "./library";
import { formFromBook, formSpan, formToFields, isFormValid, newBookForm } from "./bookForm";

const book = (id: number, overrides: Partial<BookSummary> = {}): BookSummary => ({
  id,
  title: `Book ${id}`,
  author: null,
  pageCount: 100,
  bookSize: "B5",
  orientation: "VERTICAL",
  coverStyle: "BOTTOM_BAND",
  primaryColor: "#112233",
  secondaryColor: "#aabbcc",
  fileStatus: "AVAILABLE",
  storageMode: "COPY",
  fileSizeBytes: 1000,
  originalFileName: "b.pdf",
  createdAt: "2026-01-01 10:00:00",
  ...overrides,
});

const shelves: ShelfData[] = [
  { id: 1, name: "Shelf 1", capacity: 10, sortOrder: 1, items: [{ id: 1, start: 1, span: 1, book: book(1), decorationId: null }] },
  { id: 2, name: "Reading", capacity: 10, sortOrder: 2, items: [{ id: 2, start: 3, span: 2, book: book(2), decorationId: null }] },
];

describe("findBook / describePlacement", () => {
  it("finds a book on any shelf", () => {
    expect(findBook(shelves, 2)?.shelf.name).toBe("Reading");
    expect(findBook(shelves, 99)).toBeNull();
  });

  it("describes single and multi-slot placements", () => {
    expect(describePlacement(shelves, 1)).toBe("Shelf 1, slot 1");
    expect(describePlacement(shelves, 2)).toBe("Reading, slots 3\u20134");
    expect(describePlacement(shelves, 99)).toBeNull();
  });
});

describe("book form", () => {
  it("defaults the title to the file name", () => {
    expect(newBookForm({ title: null, fileName: "Clean Code.PDF" }).title).toBe("Clean Code");
    expect(newBookForm({ title: "Real", fileName: "x.pdf" }).title).toBe("Real");
  });

  it("starts with the spec defaults", () => {
    const form = newBookForm({ title: "T", fileName: "t.pdf" });
    expect([form.bookSize, form.orientation, form.coverStyle]).toEqual(["B5", "VERTICAL", "BOTTOM_BAND"]);
  });

  it("trims text and turns a blank author into null", () => {
    const fields = formToFields({ ...newBookForm({ title: "x", fileName: "x.pdf" }), title: "  T  ", author: "   " });
    expect(fields.title).toBe("T");
    expect(fields.author).toBeNull();
  });

  it("round-trips an existing book", () => {
    const form = formFromBook(book(1, { author: "Ann", orientation: "HORIZONTAL" }));
    expect(formToFields(form)).toMatchObject({ title: "Book 1", author: "Ann", orientation: "HORIZONTAL" });
  });

  it("needs a title", () => {
    const form = newBookForm({ title: "T", fileName: "t.pdf" });
    expect(isFormValid(form)).toBe(true);
    expect(isFormValid({ ...form, title: "  " })).toBe(false);
  });

  it("computes the span from size, orientation and pages", () => {
    const form = newBookForm({ title: "T", fileName: "t.pdf" });
    expect(formSpan(form, 300)).toBe(1);
    expect(formSpan(form, 900)).toBe(2);
    expect(formSpan({ ...form, orientation: "HORIZONTAL", bookSize: "A5" }, 10)).toBe(4);
  });
});

describe("formatBytes", () => {
  it("picks a readable unit", () => {
    expect(formatBytes(10)).toBe("1 KB");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });
});
