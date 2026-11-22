import { useCallback, useEffect, useState } from "react";

import { toAppError, type AppError } from "../../../api/error";
import { moveItem, swapBooks } from "../../../api/items";
import { addBook, refreshFileStatus, relinkBook, removeBook, updateBook } from "../../../api/books";
import {
  createShelf,
  deleteShelf,
  listShelves,
  reorderShelves,
  updateShelf,
} from "../../../api/shelves";
import type { AddBookRequest, BookFields, ShelfData } from "../types";

type Status = "loading" | "ready" | "error";

// Write actions resolve to the error, or null on success, so forms can show it next to the control.
export type ActionResult = Promise<AppError | null>;

export type AddBookOutcome = { error: AppError } | { error: null; bookId: number; shelves: ShelfData[] };

export function useShelves() {
  const [shelves, setShelves] = useState<ShelfData[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [loadError, setLoadError] = useState<AppError | null>(null);

  const reload = useCallback(async () => {
    setStatus("loading");
    try {
      setShelves(await listShelves());
      setLoadError(null);
      setStatus("ready");
    } catch (err) {
      setLoadError(toAppError(err));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // A linked PDF may have been moved or restored while the app was in the background.
  useEffect(() => {
    const refresh = () => {
      refreshFileStatus()
        .then(setShelves)
        .catch(() => undefined);
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const run = useCallback(async (action: () => Promise<ShelfData[]>): ActionResult => {
    try {
      setShelves(await action());
      return null;
    } catch (err) {
      return toAppError(err);
    }
  }, []);

  const add = useCallback(async (request: AddBookRequest): Promise<AddBookOutcome> => {
    try {
      const result = await addBook(request);
      setShelves(result.shelves);
      return { error: null, bookId: result.bookId, shelves: result.shelves };
    } catch (err) {
      return { error: toAppError(err) };
    }
  }, []);

  // Quietly re-reads the shelves, for changes made outside these actions (reading progress, file status).
  const refresh = useCallback(async () => {
    try {
      setShelves(await listShelves());
    } catch {
      // The list on screen stays as it was.
    }
  }, []);

  return {
    shelves,
    status,
    loadError,
    reload,
    refresh,
    create: (name: string, capacity: number) => run(() => createShelf(name, capacity)),
    update: (id: number, name: string, capacity: number) =>
      run(() => updateShelf(id, name, capacity)),
    reorder: (ids: number[]) => run(() => reorderShelves(ids)),
    remove: (id: number) => run(() => deleteShelf(id)),
    moveItem: (itemId: number, shelfId: number, start: number) => run(() => moveItem(itemId, shelfId, start)),
    swapBooks: (itemA: number, itemB: number) => run(() => swapBooks(itemA, itemB)),
    addBook: add,
    editBook: (id: number, fields: BookFields) => run(() => updateBook(id, fields)),
    deleteBook: (id: number, deleteFile: boolean) => run(() => removeBook(id, deleteFile)),
    relinkBook: (id: number, path: string, acceptChanged: boolean) =>
      run(() => relinkBook(id, path, acceptChanged)),
  };
}
