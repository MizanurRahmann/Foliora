import { useState } from "react";
import type { BookData } from "../../types";
import Book from "../book/Book";
import "./ShelfSpace.scss";

interface ShelfSpaceProps {
  shelfNumber: number;
  position: number;
  book?: BookData;
  onMoveBook: (bookId: string, shelfNumber: number, position: number) => void;
}

function ShelfSpace({ shelfNumber, position, book, onMoveBook }: ShelfSpaceProps) {
  const [isOver, setIsOver] = useState(false);

  return (
    <div
      className={`shelf-space${isOver ? " shelf-space--over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const bookId = e.dataTransfer.getData("text/plain");
        if (bookId) onMoveBook(bookId, shelfNumber, position);
      }}
    >
      {book && <Book book={book} />}
    </div>
  );
}

export default ShelfSpace;