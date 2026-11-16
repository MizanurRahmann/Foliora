import type { CSSProperties } from "react";

import "./Shelf.scss";

import type { BookSummary, ShelfData } from "../../types";
import Book, { type MenuAnchor } from "../book/Book";
import ShelfSpace from "../shelfSpace/ShelfSpace";

interface ShelfProps {
  shelf: ShelfData;
  highlightedBookId?: number | null;
  onOpenBookMenu?: (book: BookSummary, anchor: MenuAnchor) => void;
}

type ShelfStyles = CSSProperties & { "--capacity": number };

function Shelf({ shelf, highlightedBookId = null, onOpenBookMenu }: ShelfProps) {
  const positions = Array.from({ length: shelf.capacity }, (_, index) => index + 1);
  const styles: ShelfStyles = { "--capacity": shelf.capacity };

  return (
    <div className="shelf" style={styles} role="group" aria-label={shelf.name}>
      {positions.map((position) => (
        <ShelfSpace key={position} position={position} />
      ))}

      {/* Decorations are drawn once the decoration library exists. */}
      {shelf.items.map(
        (item) =>
          item.book && (
            <div
              key={item.id}
              className="shelf__item"
              style={{ gridColumn: `${item.start} / span ${item.span}` }}
            >
              <Book
                book={item.book}
                isNew={item.book.id === highlightedBookId}
                onOpenMenu={onOpenBookMenu}
              />
            </div>
          ),
      )}
    </div>
  );
}

export default Shelf;