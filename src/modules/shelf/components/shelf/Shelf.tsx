import type { CSSProperties } from "react";

import "./Shelf.scss";

import type { ShelfData } from "../../types";
import Book from "../book/Book";
import ShelfSpace from "../shelfSpace/ShelfSpace";

interface ShelfProps {
  shelf: ShelfData;
}

type ShelfStyles = CSSProperties & { "--capacity": number };

function Shelf({ shelf }: ShelfProps) {
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
              <Book book={item.book} />
            </div>
          ),
      )}
    </div>
  );
}

export default Shelf;