import type { ShelfData } from "../modules/shelf/types";
import { call } from "./invoke";

export const moveItem = (itemId: number, shelfId: number, startSlot: number) =>
  call<ShelfData[]>("move_item", { itemId, shelfId, startSlot });

export const swapBooks = (itemA: number, itemB: number) =>
  call<ShelfData[]>("swap_books", { itemA, itemB });
