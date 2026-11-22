import { call } from "./invoke";

// The PDF as raw bytes. Rejects with FILE_MISSING when the file cannot be found.
export const readBookFile = (bookId: number) => call<ArrayBuffer>("read_book_file", { bookId });

export const saveReadingProgress = (bookId: number, page: number) =>
  call<void>("save_reading_progress", { bookId, page });
