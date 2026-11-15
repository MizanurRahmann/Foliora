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

export interface BookData {
  id: string;
  primaryColor: string;
  secondaryColor: string;
  title: string;
  author: string;
  shelfNumber: number;
  position: number;
  size: string;
  pages: number;
  coverStyle?: CoverStyle;
  storageMode?: StorageMode;
  file?: { name: string; size: string };
}

export interface ShelfData {
  shelfId: number;
  books: BookData[];
}