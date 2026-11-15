import "./Menu.scss";

import { BsJournalPlus } from "react-icons/bs";
import { TbCategoryPlus } from "react-icons/tb";

interface MenuProps {
  onAddShelf: () => void;
  onAddBook: () => void;
}

function SideMenu({ onAddShelf, onAddBook }: MenuProps) {
  return (
    <>
      <div className="brand"></div>

      <div className="menu-items">
        <button
          type="button"
          className="menu-item"
          aria-label="Add New Shelf"
          data-tooltip="Add New Shelf"
          onClick={onAddShelf}
        >
          <TbCategoryPlus />
        </button>
        <button
          type="button"
          className="menu-item"
          aria-label="Add New Book"
          data-tooltip="Add New Book"
          onClick={onAddBook}
        >
          <BsJournalPlus />
        </button>
        <div className="menu-item">C</div>
      </div>
    </>
  );
}

export default SideMenu;
