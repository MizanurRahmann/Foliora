export type CoverStyle = "bottom-band" | "center-label" | "double-stripe";
export type StorageMode = "copy" | "link";

// JSON produced by the Add Book form; this is what the backend will receive.
export interface NewBookPayload {
  title: string;
  author: string;
  pages: number;
  size: string;
  primaryColor: string;
  secondaryColor: string;
  coverStyle: CoverStyle;
  storageMode: StorageMode;
  file: { name: string; size: string };
}

// Mirrors src-tauri/src/shelves.rs.
export interface BookSummary {
  id: number;
  title: string;
  author: string | null;
  pageCount: number;
  bookSize: "A5" | "B5";
  orientation: "VERTICAL" | "HORIZONTAL";
  coverStyle: "BOTTOM_BAND" | "CENTER_LABEL" | "DOUBLE_STRIPE";
  primaryColor: string;
  secondaryColor: string;
  fileStatus: "AVAILABLE" | "MISSING";
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