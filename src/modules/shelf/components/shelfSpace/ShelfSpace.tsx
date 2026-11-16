import "./ShelfSpace.scss";

interface ShelfSpaceProps {
  position: number;
}

// One empty slot. Drop handling returns with drag-and-drop in Phase 5.
function ShelfSpace({ position }: ShelfSpaceProps) {
  return <div className="shelf-space" style={{ gridColumn: position }} />;
}

export default ShelfSpace;