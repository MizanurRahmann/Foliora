// Mirrors src-tauri/src/placement.rs; both run the cases in tests/placement-cases.json.
// Slots are 1-based and an item covers `start .. start + span - 1`.

export type BookSize = "A5" | "B5";
export type Orientation = "VERTICAL" | "HORIZONTAL";

export interface Placed {
  id: number;
  start: number;
  span: number;
}

export interface ShelfLayout {
  id: number;
  capacity: number;
  items: Placed[];
}

export interface Slot {
  shelfId: number;
  start: number;
}

export interface SwapPlan {
  a: Slot;
  b: Slot;
}

// Vertical books over this many pages need two slots.
const THICK_BOOK_PAGES = 800;

export function bookSpan(size: BookSize, orientation: Orientation, pages: number): number {
  if (orientation === "VERTICAL") return pages > THICK_BOOK_PAGES ? 2 : 1;
  return size === "A5" ? 4 : 5;
}

function overlaps(aStart: number, aSpan: number, bStart: number, bSpan: number): boolean {
  return aStart < bStart + bSpan && bStart < aStart + aSpan;
}

// `ignore` lists items that are being moved and so must not block their own destination.
export function canPlace(
  capacity: number,
  items: readonly Placed[],
  span: number,
  start: number,
  ignore: readonly number[] = [],
): boolean {
  if (span < 1 || start < 1 || start + span - 1 > capacity) return false;
  return !items.some(
    (item) => !ignore.includes(item.id) && overlaps(start, span, item.start, item.span),
  );
}

// Shelves are searched in the order given, which is the display order.
export function firstFit(shelves: readonly ShelfLayout[], span: number): Slot | null {
  for (const shelf of shelves) {
    for (let start = 1; start + span - 1 <= shelf.capacity; start++) {
      if (canPlace(shelf.capacity, shelf.items, span, start)) {
        return { shelfId: shelf.id, start };
      }
    }
  }
  return null;
}

// Where two books end up after exchanging places. Does not check that they fit.
export function swapTargets(a: Slot, aSpan: number, b: Slot, bSpan: number): SwapPlan {
  if (a.shelfId !== b.shelfId) return { a: { ...b }, b: { ...a } };

  // Same shelf: the right-hand book takes the left start, the left-hand book ends where the right one did.
  const aIsLeft = a.start < b.start;
  const [left, leftSpan, right, rightSpan] = aIsLeft ? [a, aSpan, b, bSpan] : [b, bSpan, a, aSpan];
  const rightNew: Slot = { shelfId: a.shelfId, start: left.start };
  const leftNew: Slot = { shelfId: a.shelfId, start: right.start + rightSpan - leftSpan };

  return aIsLeft ? { a: leftNew, b: rightNew } : { a: rightNew, b: leftNew };
}

// Returns the new slots for both books, or null if either is missing or the exchange does not fit.
export function planSwap(
  shelves: readonly ShelfLayout[],
  aId: number,
  bId: number,
): SwapPlan | null {
  if (aId === bId) return null;

  const find = (id: number) => {
    for (const shelf of shelves) {
      const item = shelf.items.find((candidate) => candidate.id === id);
      if (item) return { shelf, item };
    }
    return null;
  };
  const foundA = find(aId);
  const foundB = find(bId);
  if (!foundA || !foundB) return null;

  const plan = swapTargets(
    { shelfId: foundA.shelf.id, start: foundA.item.start },
    foundA.item.span,
    { shelfId: foundB.shelf.id, start: foundB.item.start },
    foundB.item.span,
  );

  const ignore = [aId, bId];
  const fits = (slot: Slot, span: number) => {
    const shelf = shelves.find((candidate) => candidate.id === slot.shelfId);
    return !!shelf && canPlace(shelf.capacity, shelf.items, span, slot.start, ignore);
  };
  const collide =
    plan.a.shelfId === plan.b.shelfId &&
    overlaps(plan.a.start, foundA.item.span, plan.b.start, foundB.item.span);

  return fits(plan.a, foundA.item.span) && fits(plan.b, foundB.item.span) && !collide ? plan : null;
}
