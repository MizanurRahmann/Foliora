import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import "./BookContextMenu.scss";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

interface BookContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

const VIEWPORT_MARGIN = 8;

function BookContextMenu({ x, y, items, onClose }: BookContextMenuProps) {
  const menuRef = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(VIEWPORT_MARGIN, Math.min(x, window.innerWidth - width - VIEWPORT_MARGIN)),
      top: Math.max(VIEWPORT_MARGIN, Math.min(y, window.innerHeight - height - VIEWPORT_MARGIN)),
    });
  }, [x, y]);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (index: number) => buttons[(index + buttons.length) % buttons.length]?.focus();

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focus(current + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focus(current - 1);
        break;
      case "Home":
        event.preventDefault();
        focus(0);
        break;
      case "End":
        event.preventDefault();
        focus(buttons.length - 1);
        break;
      case "Escape":
      case "Tab":
        event.preventDefault();
        onClose();
        break;
    }
  };

  return (
    <>
      <div
        className="book-menu__backdrop"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <ul
        ref={menuRef}
        className="book-menu"
        role="menu"
        style={position}
        onKeyDown={handleKeyDown}
      >
        {items.map((item) => (
          <li key={item.label} role="none">
            <button
              type="button"
              role="menuitem"
              className={`book-menu__item${item.danger ? " book-menu__item--danger" : ""}`}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export default BookContextMenu;
