
import { useState, type CSSProperties, type DragEvent } from "react";
import "./Book.scss";

import type { BookData } from "../../types";

interface BookProps {
  book: BookData;
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
    `book--${book.coverStyle ?? "bottom-band"}`,
    isDragging && "book--dragging"
  ].filter(Boolean).join(" ");

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("text/plain", book.id);
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
      title={`${book.title} — ${book.author}`}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <span className="book__title">{book.title}</span>
    </div>
  );
}

export default Book;
