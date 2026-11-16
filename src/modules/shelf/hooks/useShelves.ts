import { useCallback, useEffect, useState } from "react";

import { toAppError, type AppError } from "../../../api/error";
import {
    createShelf,
    deleteShelf,
    listShelves,
    reorderShelves,
    updateShelf,
} from "../../../api/shelves";
import type { ShelfData } from "../types";

type Status = "loading" | "ready" | "error";

// Write actions resolve to the error, or null on success, so forms can show it next to the control.
export type ActionResult = Promise<AppError | null>;

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

  const run = useCallback(async (action: () => Promise<ShelfData[]>): ActionResult => {
    try {
      setShelves(await action());
      return null;
    } catch (err) {
      return toAppError(err);
    }
  }, []);

  return {
    shelves,
    status,
    loadError,
    reload,
    create: (name: string, capacity: number) => run(() => createShelf(name, capacity)),
    update: (id: number, name: string, capacity: number) =>
      run(() => updateShelf(id, name, capacity)),
    reorder: (ids: number[]) => run(() => reorderShelves(ids)),
    remove: (id: number) => run(() => deleteShelf(id)),
  };
}
