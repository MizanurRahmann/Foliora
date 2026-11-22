import { useState, type CSSProperties, type DragEvent } from "react";

import "./Shelf.scss";

import { canPlace, planSwap, type ShelfLayout } from "../../placement";
import type { BookSummary, ShelfData } from "../../types";
import Book, { type MenuAnchor } from "../book/Book";
import ShelfSpace from "../shelfSpace/ShelfSpace";

// The item being dragged. `span` is how many slots it covers.
export interface DragInfo {
  itemId: number;
  span: number;
}

interface ShelfProps {
  shelf: ShelfData;
  // Occupancy of every shelf, for checking an exchange with a book on another shelf.
  layouts: readonly ShelfLayout[];
  drag?: DragInfo | null;
  highlightedBookId?: number | null;
  movedBookId?: number | null;
  onOpenBookMenu?: (book: BookSummary, anchor: MenuAnchor) => void;
  onOpenBook?: (book: BookSummary, element: HTMLElement) => void;
  onDragStart?: (info: DragInfo) => void;
  onDragEnd?: () => void;
  onMove?: (itemId: number, shelfId: number, start: number) => void;
  onSwap?: (itemA: number, itemB: number) => void;
}

type ShelfStyles = CSSProperties & { "--capacity": number };

function Shelf({
  shelf,
  layouts,
  drag = null,
  highlightedBookId = null,
  movedBookId = null,
  onOpenBookMenu,
  onOpenBook,
  onDragStart,
  onDragEnd,
  onMove,
  onSwap,
}: ShelfProps) {
  const [hoverStart, setHoverStart] = useState<number | null>(null);
  const [swapOver, setSwapOver] = useState<number | null>(null);

  const positions = Array.from({ length: shelf.capacity }, (_, index) => index + 1);
  const styles: ShelfStyles = { "--capacity": shelf.capacity };

  const canStartAt = (start: number) =>
    !!drag && canPlace(shelf.capacity, shelf.items, drag.span, start, [drag.itemId]);

  const hoverState = (position: number): "ok" | "bad" | null => {
    if (!drag || hoverStart === null) return null;
    if (position < hoverStart || position >= hoverStart + drag.span) return null;
    return canStartAt(hoverStart) ? "ok" : "bad";
  };

  const clear = () => {
    setHoverStart(null);
    setSwapOver(null);
  };

  const handleSpaceOver = (position: number, event: DragEvent<HTMLDivElement>) => {
    if (!drag) return;
    setHoverStart(position);
    // Allowing the drop is what turns the cursor into "droppable"; invalid spots stay refused.
    if (canStartAt(position)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  };

  const handleSpaceDrop = (position: number, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const dragged = drag;
    clear();
    if (dragged && canStartAt(position)) onMove?.(dragged.itemId, shelf.id, position);
  };

  const handleItemOver = (itemId: number, event: DragEvent<HTMLDivElement>) => {
    if (!drag) return;
    setHoverStart(null);
    setSwapOver(itemId);
    if (planSwap(layouts, drag.itemId, itemId)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  };

  const handleItemDrop = (itemId: number, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const dragged = drag;
    clear();
    if (dragged && planSwap(layouts, dragged.itemId, itemId)) onSwap?.(dragged.itemId, itemId);
  };

  return (
    <div
      className="shelf"
      style={styles}
      role="group"
      aria-label={shelf.name}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clear();
      }}
    >
      {positions.map((position) => (
        <ShelfSpace
          key={position}
          position={position}
          isDropStart={canStartAt(position)}
          hover={hoverState(position)}
          onDragOver={handleSpaceOver}
          onDrop={handleSpaceDrop}
        />
      ))}

      {/* Decorations are drawn once the decoration library exists. */}
      {shelf.items.map((item) => {
        if (!item.book) return null;
        const isDragged = drag?.itemId === item.id;
        const swapState =
          drag && !isDragged && swapOver === item.id
            ? planSwap(layouts, drag.itemId, item.id)
              ? "ok"
              : "bad"
            : null;
        const className = [
          "shelf__item",
          isDragged && "shelf__item--dragged",
          swapState && `shelf__item--swap-${swapState}`,
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            key={item.id}
            className={className}
            style={{ gridColumn: `${item.start} / span ${item.span}` }}
            onDragOver={isDragged ? undefined : (event) => handleItemOver(item.id, event)}
            onDrop={isDragged ? undefined : (event) => handleItemDrop(item.id, event)}
          >
            <Book
              book={item.book}
              itemId={item.id}
              span={item.span}
              isNew={item.book.id === highlightedBookId}
              isMoved={item.book.id === movedBookId}
              isDragging={isDragged}
              onOpenMenu={onOpenBookMenu}
              onOpen={onOpenBook}
              onDragStart={onDragStart}
              onDragEnd={() => {
                clear();
                onDragEnd?.();
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default Shelf;
