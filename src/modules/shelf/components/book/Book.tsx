import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent } from "react";
import "./Book.scss";

import type { BookSummary } from "../../types";

export interface MenuAnchor {
  x: number;
  y: number;
}

interface BookProps {
  book: BookSummary;
  itemId: number;
  span: number;
  isNew?: boolean;
  isMoved?: boolean;
  isDragging?: boolean;
  onOpenMenu?: (book: BookSummary, anchor: MenuAnchor) => void;
  onOpen?: (book: BookSummary, element: HTMLElement) => void;
  onDragStart?: (info: { itemId: number; span: number }) => void;
  onDragEnd?: () => void;
}

type BookStyles = CSSProperties & {
  "--primary": string;
  "--secondary": string;
};

function Book({
  book,
  itemId,
  span,
  isNew = false,
  isMoved = false,
  isDragging = false,
  onOpenMenu,
  onOpen,
  onDragStart,
  onDragEnd,
}: BookProps) {
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
    isMoved && "book--moved",
  ]
    .filter(Boolean)
    .join(" ");

  const label = [book.title, book.author && `by ${book.author}`, isMissing && "PDF file missing"]
    .filter(Boolean)
    .join(", ");

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("text/plain", String(book.id));
    event.dataTransfer.effectAllowed = "move";

    // Changing the page in the same tick can cancel the drag in some webviews.
    setTimeout(() => onDragStart?.({ itemId, span }), 0);
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    onOpenMenu?.(book, { x: event.clientX, y: event.clientY });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onOpen?.(book, event.currentTarget);
      return;
    }
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
      role="button"
      data-book-id={book.id}
      aria-label={label}
      aria-haspopup="menu"
      title={book.author ? `${book.title} \u2014 ${book.author}` : book.title}
      onDragStart={handleDragStart}
      onDragEnd={() => onDragEnd?.()}
      onClick={(event) => onOpen?.(book, event.currentTarget)}
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
