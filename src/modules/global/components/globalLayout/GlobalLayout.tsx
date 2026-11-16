import { useEffect, useRef, useState } from "react";
import "./GlobalLayout.scss";

import AddBookPanel from "../../../shelf/components/addBookPanel/AddBookPanel";
import type { MenuAnchor } from "../../../shelf/components/book/Book";
import BookContextMenu from "../../../shelf/components/bookContextMenu/BookContextMenu";
import BookInfoPanel from "../../../shelf/components/bookPanels/BookInfoPanel";
import EditBookPanel from "../../../shelf/components/bookPanels/EditBookPanel";
import RemoveBookPanel from "../../../shelf/components/bookPanels/RemoveBookPanel";
import ManageShelves from "../../../shelf/components/manageShelves/ManageShelves";
import Shelf from "../../../shelf/components/shelf/Shelf";
import { useShelves } from "../../../shelf/hooks/useShelves";
import type { AddBookRequest, BookSummary } from "../../../shelf/types";
import { describePlacement, findBook } from "../../../shelf/utils/library";
import { useActivePanel } from "../../hooks/useActivePanel";
import SideMenu, { type View } from "../menu/SideMenu";

type PanelId = "addBook" | "bookInfo" | "editBook" | "removeBook";

const NOTICE_MS = 5000;

interface Notice {
  bookId: number;
  text: string;
}

function GlobalLayout() {
  const [view, setView] = useState<View>("home");
  const {
    shelves,
    status,
    loadError,
    reload,
    create,
    update,
    reorder,
    remove,
    addBook,
    editBook,
    deleteBook,
    relinkBook,
  } = useShelves();
  const { activePanel, openPanel, closePanel } = useActivePanel<PanelId>();

  // Kept after a panel closes so its content does not vanish mid-animation.
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ book: BookSummary; anchor: MenuAnchor } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const menuOpenerRef = useRef<HTMLElement | null>(null);

  const selectedBook = selectedBookId === null ? null : (findBook(shelves, selectedBookId)?.book ?? null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const openBookMenu = (book: BookSummary, anchor: MenuAnchor) => {
    menuOpenerRef.current = document.activeElement as HTMLElement | null;
    setMenu({ book, anchor });
  };

  const closeBookMenu = () => {
    setMenu(null);
    menuOpenerRef.current?.focus();
  };

  const openBookPanel = (book: BookSummary, panel: PanelId) => {
    setSelectedBookId(book.id);
    openPanel(panel);
  };

  const handleAddBook = async (request: AddBookRequest) => {
    const outcome = await addBook(request);
    if (outcome.error) return outcome.error;

    const place = describePlacement(outcome.shelves, outcome.bookId);
    setNotice({ bookId: outcome.bookId, text: `Added \u201C${request.title}\u201D to ${place ?? "your shelves"}` });
    setView("home");
    return null;
  };

  const renderContent = () => {
    if (status === "loading") return <p className="global-layout__message">Loading your shelves…</p>;

    if (status === "error") {
      return (
        <div className="global-layout__message" role="alert">
          <p>Could not load your shelves: {loadError?.message}</p>
          <button type="button" className="btn_primary" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      );
    }

    if (view === "shelves") {
      return (
        <ManageShelves
          shelves={shelves}
          onCreate={create}
          onUpdate={update}
          onReorder={reorder}
          onDelete={remove}
        />
      );
    }

    if (shelves.length === 0) {
      return (
        <div className="global-layout__message">
          <p>You have no shelves yet.</p>
          <button type="button" className="btn_primary" onClick={() => setView("shelves")}>
            Manage shelves
          </button>
        </div>
      );
    }

    return shelves.map((shelf) => (
      <Shelf
        key={shelf.id}
        shelf={shelf}
        highlightedBookId={notice?.bookId ?? null}
        onOpenBookMenu={openBookMenu}
      />
    ));
  };

  return (
    <section className="global-layout">
      <nav className="global-layout__side-menu">
        <SideMenu view={view} onNavigate={setView} onAddBook={() => openPanel("addBook")} />
      </nav>

      <div className="global-layout__inner">
        <div className="global-layout__bookshelf">{renderContent()}</div>
      </div>

      {notice && (
        <div className="global-layout__toast" role="status">
          {notice.text}
        </div>
      )}

      {menu && (
        <BookContextMenu
          x={menu.anchor.x}
          y={menu.anchor.y}
          onClose={closeBookMenu}
          items={[
            { label: "View details", onSelect: () => openBookPanel(menu.book, "bookInfo") },
            { label: "Edit", onSelect: () => openBookPanel(menu.book, "editBook") },
            { label: "Remove", danger: true, onSelect: () => openBookPanel(menu.book, "removeBook") },
          ]}
        />
      )}

      <AddBookPanel isOpen={activePanel === "addBook"} onClose={closePanel} onAddBook={handleAddBook} />
      <BookInfoPanel
        isOpen={activePanel === "bookInfo"}
        book={selectedBook}
        onClose={closePanel}
        onRelink={relinkBook}
      />
      <EditBookPanel
        isOpen={activePanel === "editBook"}
        book={selectedBook}
        onClose={closePanel}
        onSave={editBook}
      />
      <RemoveBookPanel
        isOpen={activePanel === "removeBook"}
        book={selectedBook}
        onClose={closePanel}
        onConfirm={deleteBook}
      />
    </section>
  );
}

export default GlobalLayout;
