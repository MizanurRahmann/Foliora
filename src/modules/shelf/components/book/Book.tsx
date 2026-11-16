import { useState, type CSSProperties, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import "./Book.scss";

import type { BookSummary } from "../../types";

export interface MenuAnchor {
  x: number;
  y: number;
}

interface BookProps {
  book: BookSummary;
  isNew?: boolean;
  onOpenMenu?: (book: BookSummary, anchor: MenuAnchor) => void;
}

type BookStyles = CSSProperties & {
  "--primary": string;
  "--secondary": string;
};

function Book({ book, isNew = false, onOpenMenu }: BookProps) {
  const [isDragging, setIsDragging] = useState(false);

  const bookStyles: BookStyles = {
    "--primary": book.primaryColor,
    "--secondary": book.secondaryColor,
  };

  const isMissing = book.fileStatus === "MISSING";
  const className = [
    "book",
    `book--${book.coverStyle.toLowerCase().replace(/_/g, "-")}`,
    isDragging && "book--dragging",
    isNew && "book--new",
  ]
    .filter(Boolean)
    .join(" ");

  const label = [book.title, book.author && `by ${book.author}`, isMissing && "PDF file missing"]
    .filter(Boolean)
    .join(", ");

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("text/plain", String(book.id));
    event.dataTransfer.effectAllowed = "move";

    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    onOpenMenu?.(book, { x: event.clientX, y: event.clientY });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    onOpenMenu?.(book, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  };

  return (
    <div
      className={className}
      style={bookStyles}
      draggable
      tabIndex={0}
      aria-label={label}
      aria-haspopup="menu"
      title={book.author ? `${book.title} \u2014 ${book.author}` : book.title}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
    >
      {isMissing && (
        <span className="book__missing" title="The PDF file could not be found" aria-hidden="true">
          !
        </span>
      )}
      <span className="book__title">{book.title}</span>
    </div>
  );
}

export default Book;
