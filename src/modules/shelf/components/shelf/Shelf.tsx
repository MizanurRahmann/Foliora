import "./Shelf.scss";

import { SLOTS_PER_SHELF } from "../../constants";
import type { BookData } from "../../types";
import ShelfSpace from "../shelfSpace/ShelfSpace";

interface ShelfProps {
  shelfNumber: number;
  books: BookData[];
  onMoveBook: (bookId: string, shelfNumber: number, position: number) => void;
}

function Shelf({ shelfNumber, books, onMoveBook }: ShelfProps) {
  const booksByPosition = new Map(
    books.map((book) => [book.position, book]),
  );

  const positions = Array.from(
    { length: SLOTS_PER_SHELF },
    (_, index) => index + 1,
  );

  return (
    <div className="shelf">
      {positions.map((position) => (
        <ShelfSpace
          key={position}
          shelfNumber={shelfNumber}
          position={position}
          book={booksByPosition.get(position)}
          onMoveBook={onMoveBook}
        />
      ))}
    </div>
  );
}

export default Shelf;