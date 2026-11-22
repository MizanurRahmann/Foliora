import type { BookSize, Orientation } from "./placement";

export type CoverStyle = "BOTTOM_BAND" | "CENTER_LABEL" | "DOUBLE_STRIPE";
export type StorageMode = "COPY" | "LINK";

// Mirrors src-tauri/src/shelves.rs.
export interface BookSummary {
  id: number;
  title: string;
  author: string | null;
  pageCount: number;
  bookSize: BookSize;
  orientation: Orientation;
  coverStyle: CoverStyle;
  primaryColor: string;
  secondaryColor: string;
  fileStatus: "AVAILABLE" | "MISSING";
  lastReadPage: number;
  storageMode: StorageMode;
  fileSizeBytes: number;
  originalFileName: string;
  createdAt: string;
}

// Exactly one of `book` and `decorationId` is set.
export interface ShelfItem {
  id: number;
  start: number;
  span: number;
  book: BookSummary | null;
  decorationId: number | null;
}

export interface ShelfData {
  id: number;
  name: string;
  capacity: number;
  sortOrder: number;
  items: ShelfItem[];
}

// What the user can edit about a book (src-tauri/src/books.rs).
export interface BookFields {
  title: string;
  author: string | null;
  bookSize: BookSize;
  orientation: Orientation;
  coverStyle: CoverStyle;
  primaryColor: string;
  secondaryColor: string;
}

export interface AddBookRequest extends BookFields {
  sourcePath: string;
  storageMode: StorageMode;
}

export interface PdfInspection {
  title: string | null;
  author: string | null;
  pageCount: number;
  sizeBytes: number;
  hash: string;
  fileName: string;
  duplicateOf: { id: number; title: string } | null;
}
