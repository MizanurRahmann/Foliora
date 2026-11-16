import { bookSpan, type BookSize, type Orientation } from "../placement";
import type { BookFields, BookSummary, CoverStyle } from "../types";

export interface BookForm {
  title: string;
  author: string;
  bookSize: BookSize;
  orientation: Orientation;
  coverStyle: CoverStyle;
  primaryColor: string;
  secondaryColor: string;
}

export const DEFAULT_COLORS = { primaryColor: "#1d3557", secondaryColor: "#f1faee" };

// The title falls back to the file name when the PDF has none.
export function newBookForm(info: { title: string | null; fileName: string }): BookForm {
  return {
    title: info.title ?? info.fileName.replace(/\.pdf$/i, ""),
    author: "",
    bookSize: "B5",
    orientation: "VERTICAL",
    coverStyle: "BOTTOM_BAND",
    ...DEFAULT_COLORS,
  };
}

export function formFromBook(book: BookSummary): BookForm {
  return {
    title: book.title,
    author: book.author ?? "",
    bookSize: book.bookSize,
    orientation: book.orientation,
    coverStyle: book.coverStyle,
    primaryColor: book.primaryColor,
    secondaryColor: book.secondaryColor,
  };
}

export function formToFields(form: BookForm): BookFields {
  return { ...form, title: form.title.trim(), author: form.author.trim() || null };
}

export function isFormValid(form: BookForm): boolean {
  return form.title.trim().length > 0;
}

export function formSpan(form: BookForm, pageCount: number): number {
  return bookSpan(form.bookSize, form.orientation, pageCount);
}
