
import { useState, type CSSProperties, type DragEvent } from "react";
import "./Book.scss";

import type { BookSummary } from "../../types";

interface BookProps {
  book: BookSummary;
}

type BookStyles = CSSProperties & {
  "--primary": string;
  "--secondary": string;
};

function Book({ book }: BookProps) {
  const [isDragging, setIsDragging] = useState(false);

  const bookStyles: BookStyles = {
    "--primary": book.primaryColor,
    "--secondary": book.secondaryColor,
  };

  const className = [
    "book",
    `book--${book.coverStyle.toLowerCase().replace(/_/g, "-")}`,
    isDragging && "book--dragging"
  ].filter(Boolean).join(" ");

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("text/plain", String(book.id));
    event.dataTransfer.effectAllowed = "move";

    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <div
      className={className}
      style={bookStyles}
      draggable
      title={book.author ? `${book.title} — ${book.author}` : book.title}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <span className="book__title">{book.title}</span>
    </div>
  );
}

export default Book;
