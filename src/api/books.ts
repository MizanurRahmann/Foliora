import type { AddBookRequest, BookFields, PdfInspection, ShelfData } from "../modules/shelf/types";
import { call } from "./invoke";

export interface AddBookResult {
  bookId: number;
  shelves: ShelfData[];
}

export const inspectPdf = (path: string) => call<PdfInspection>("inspect_pdf", { path });

export const addBook = (request: AddBookRequest) => call<AddBookResult>("add_book", { request });

export const updateBook = (id: number, fields: BookFields) =>
  call<ShelfData[]>("update_book", { id, fields });

export const removeBook = (id: number, deleteFile: boolean) =>
  call<ShelfData[]>("remove_book", { id, deleteFile });

export const relinkBook = (id: number, path: string, acceptChanged: boolean) =>
  call<ShelfData[]>("relink_book", { id, path, acceptChanged });

export const refreshFileStatus = () => call<ShelfData[]>("refresh_file_status");
