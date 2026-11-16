import type { BookSummary, ShelfData, ShelfItem } from "../types";

export interface FoundBook {
  book: BookSummary;
  shelf: ShelfData;
  item: ShelfItem;
}

export function findBook(shelves: readonly ShelfData[], bookId: number): FoundBook | null {
  for (const shelf of shelves) {
    for (const item of shelf.items) {
      if (item.book?.id === bookId) return { book: item.book, shelf, item };
    }
  }
  return null;
}

export function slotLabel(start: number, span: number): string {
  return span > 1 ? `slots ${start}\u2013${start + span - 1}` : `slot ${start}`;
}

// For example "Shelf 2, slots 3–4".
export function describePlacement(shelves: readonly ShelfData[], bookId: number): string | null {
  const found = findBook(shelves, bookId);
  return found && `${found.shelf.name}, ${slotLabel(found.item.start, found.item.span)}`;
}
