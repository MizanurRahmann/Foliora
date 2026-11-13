import ShelfSpace from "../shelfSpace/ShelfSpace";
import "./Shelf.scss";

function Shelf() {
  return (
    <div className="shelf">
      <ShelfSpace />
      <ShelfSpace />
      <ShelfSpace />
      <ShelfSpace />
      <ShelfSpace />
    </div>
  );
}

export default Shelf;