import type { ShelfData } from "../modules/shelf/types";
import { call } from "./invoke";

// Details of a CAPACITY_TOO_SMALL error.
export interface CapacityDetails {
  minCapacity: number;
  items: { id: number; title: string | null; start: number; span: number }[];
}

// Every write returns the refreshed shelf list.
export const listShelves = () => call<ShelfData[]>("list_shelves");

export const createShelf = (name: string, capacity: number) =>
  call<ShelfData[]>("create_shelf", { name, capacity });

export const updateShelf = (id: number, name: string, capacity: number) =>
  call<ShelfData[]>("update_shelf", { id, name, capacity });

export const reorderShelves = (ids: number[]) => call<ShelfData[]>("reorder_shelves", { ids });

export const deleteShelf = (id: number) => call<ShelfData[]>("delete_shelf", { id });
