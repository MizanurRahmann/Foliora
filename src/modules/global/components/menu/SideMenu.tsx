import "./Menu.scss";

import { BsJournalPlus } from "react-icons/bs";
import { TbCategory, TbHome } from "react-icons/tb";

export type View = "home" | "shelves";

interface MenuProps {
  view: View;
  onNavigate: (view: View) => void;
}

function SideMenu({ view, onNavigate }: MenuProps) {
  const itemClass = (target: View) => `menu-item${view === target ? " menu-item--active" : ""}`;

  return (
    <>
      <div className="brand"></div>

      <div className="menu-items">
        <button
          type="button"
          className={itemClass("home")}
          aria-label="Home"
          aria-current={view === "home" ? "page" : undefined}
          data-tooltip="Home"
          onClick={() => onNavigate("home")}
        >
          <TbHome />
        </button>
        <button
          type="button"
          className={itemClass("shelves")}
          aria-label="Manage Shelves"
          aria-current={view === "shelves" ? "page" : undefined}
          data-tooltip="Manage Shelves"
          onClick={() => onNavigate("shelves")}
        >
          <TbCategory />
        </button>
        {/* Enabled in Phase 4, when books can be saved. */}
        <button
          type="button"
          className="menu-item"
          aria-label="Add New Book"
          data-tooltip="Add New Book (coming soon)"
          disabled
        >
          <BsJournalPlus />
        </button>
      </div>
    </>
  );
}

export default SideMenu;
