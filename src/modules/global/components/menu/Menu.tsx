import "./Menu.scss";

interface MenuProps {
  onAddShelf: () => void;
  onAddBook: () => void;
}

function Menu({ onAddShelf, onAddBook }: MenuProps) {
  return (
    <nav className="menu">
      <button type="button" className="menu__button" onClick={onAddShelf}>
        Add Shelf
      </button>
      <button type="button" className="menu__button" onClick={onAddBook}>
        Add New Book
      </button>
    </nav>
  );
}

export default Menu;
