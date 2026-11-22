import type { DragEvent } from "react";
import "./ShelfSpace.scss";

interface ShelfSpaceProps {
  position: number;
  // Only set while a book is being dragged.
  isDropStart?: boolean;
  hover?: "ok" | "bad" | null;
  onDragOver?: (position: number, event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (position: number, event: DragEvent<HTMLDivElement>) => void;
}

// One slot. While dragging it shows whether the book could start here.
function ShelfSpace({ position, isDropStart = false, hover = null, onDragOver, onDrop }: ShelfSpaceProps) {
  const className = [
    "shelf-space",
    isDropStart && "shelf-space--start",
    hover && `shelf-space--hover-${hover}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      style={{ gridColumn: position }}
      onDragOver={(event) => onDragOver?.(position, event)}
      onDrop={(event) => onDrop?.(position, event)}
    />
  );
}

export default ShelfSpace;
