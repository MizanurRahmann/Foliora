import { canPlace, planSwap, type ShelfLayout } from "../placement";
import type { ShelfData, ShelfItem } from "../types";

export interface ShelfTargets {
  shelf: ShelfData;
  starts: number[];
}

export function layoutsOf(shelves: readonly ShelfData[]): ShelfLayout[] {
  return shelves.map((shelf) => ({
    id: shelf.id,
    capacity: shelf.capacity,
    items: shelf.items.map(({ id, start, span }) => ({ id, start, span })),
  }));
}

export function findItem(
  shelves: readonly ShelfData[],
  itemId: number,
): { shelf: ShelfData; item: ShelfItem } | null {
  for (const shelf of shelves) {
    const item = shelf.items.find((candidate) => candidate.id === itemId);
    if (item) return { shelf, item };
  }
  return null;
}

// Whether the item may start at `start` on `shelf`; the item's own old place does not block it.
export function canMoveTo(shelf: ShelfData, item: ShelfItem, start: number): boolean {
  return canPlace(shelf.capacity, shelf.items, item.span, start, [item.id]);
}

// Every start slot the item could be moved to, per shelf. Its current place is left out.
export function moveTargets(shelves: readonly ShelfData[], itemId: number): ShelfTargets[] {
  const found = findItem(shelves, itemId);
  if (!found) return [];
  const { item, shelf: home } = found;

  const targets: ShelfTargets[] = [];
  for (const shelf of shelves) {
    const starts: number[] = [];
    for (let start = 1; start + item.span - 1 <= shelf.capacity; start++) {
      const isCurrent = shelf.id === home.id && start === item.start;
      if (!isCurrent && canMoveTo(shelf, item, start)) starts.push(start);
    }
    if (starts.length > 0) targets.push({ shelf, starts });
  }
  return targets;
}

// Books that this book can exchange places with.
export function swapPartners(shelves: readonly ShelfData[], itemId: number): ShelfItem[] {
  const layouts = layoutsOf(shelves);
  const partners: ShelfItem[] = [];
  for (const shelf of shelves) {
    for (const other of shelf.items) {
      if (other.book && other.id !== itemId && planSwap(layouts, itemId, other.id)) {
        partners.push(other);
      }
    }
  }
  return partners;
}
