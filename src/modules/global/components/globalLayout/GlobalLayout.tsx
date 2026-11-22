import { useEffect, useMemo, useRef, useState } from "react";
import "./GlobalLayout.scss";

import AddBookPanel from "../../../shelf/components/addBookPanel/AddBookPanel";
import type { MenuAnchor } from "../../../shelf/components/book/Book";
import BookContextMenu from "../../../shelf/components/bookContextMenu/BookContextMenu";
import BookProblemPanel, { type BookProblem } from "../../../shelf/components/bookPanels/BookProblemPanel";
import BookInfoPanel from "../../../shelf/components/bookPanels/BookInfoPanel";
import EditBookPanel from "../../../shelf/components/bookPanels/EditBookPanel";
import MoveBookPanel from "../../../shelf/components/bookPanels/MoveBookPanel";
import RemoveBookPanel from "../../../shelf/components/bookPanels/RemoveBookPanel";
import ManageShelves from "../../../shelf/components/manageShelves/ManageShelves";
import Shelf, { type DragInfo } from "../../../shelf/components/shelf/Shelf";
import Reader from "../../../reader/Reader";
import { useShelves } from "../../../shelf/hooks/useShelves";
import type { AddBookRequest, BookSummary } from "../../../shelf/types";
import { describePlacement, findBook } from "../../../shelf/utils/library";
import { findItem, layoutsOf } from "../../../shelf/utils/moves";
import { useActivePanel } from "../../hooks/useActivePanel";
import SideMenu, { type View } from "../menu/SideMenu";

type PanelId = "addBook" | "bookInfo" | "editBook" | "removeBook" | "moveBook" | "bookProblem";

const NOTICE_MS = 5000;
const MOVED_MS = 800;

interface Notice {
  // The book to highlight, if any.
  bookId: number | null;
  text: string;
  isError?: boolean;
}

interface Reading {
  book: BookSummary;
  origin: HTMLElement;
}

function GlobalLayout() {
  const [view, setView] = useState<View>("home");
  const {
    shelves,
    status,
    loadError,
    reload,
    refresh,
    create,
    update,
    reorder,
    remove,
    addBook,
    editBook,
    deleteBook,
    relinkBook,
    moveItem,
    swapBooks,
  } = useShelves();
  const { activePanel, openPanel, closePanel } = useActivePanel<PanelId>();

  // Kept after a panel closes so its content does not vanish mid-animation.
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ book: BookSummary; anchor: MenuAnchor } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const menuOpenerRef = useRef<HTMLElement | null>(null);
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const [movedBookId, setMovedBookId] = useState<number | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [problem, setProblem] = useState<BookProblem>("MISSING");
  const layouts = useMemo(() => layoutsOf(shelves), [shelves]);

  const selectedBook = selectedBookId === null ? null : (findBook(shelves, selectedBookId)?.book ?? null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (movedBookId === null) return;
    const timer = setTimeout(() => setMovedBookId(null), MOVED_MS);
    return () => clearTimeout(timer);
  }, [movedBookId]);

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

  // A left click opens the book. One whose file is already known to be gone goes straight to the fix.
  const openReader = (book: BookSummary, origin: HTMLElement) => {
    if (reading) return;
    if (book.fileStatus === "MISSING") {
      setProblem("MISSING");
      openBookPanel(book, "bookProblem");
      return;
    }
    setMenu(null);
    setReading({ book, origin });
  };

  const handleReaderClosed = () => {
    setReading(null);
    void refresh();
  };

  const handleReaderUnavailable = (why: BookProblem) => {
    const book = reading?.book;
    setReading(null);
    void refresh();
    if (book) {
      setProblem(why);
      openBookPanel(book, "bookProblem");
    }
  };

  const showError = (text: string) => setNotice({ bookId: null, text, isError: true });

  const handleMove = async (itemId: number, shelfId: number, start: number) => {
    const found = findItem(shelves, itemId);
    const failure = await moveItem(itemId, shelfId, start);
    if (failure) {
      showError(failure.message);
      return failure;
    }
    // Shown only now that the backend has accepted the move.
    if (found?.item.book) setMovedBookId(found.item.book.id);
    return null;
  };

  const handleSwap = async (itemA: number, itemB: number) => {
    const first = findItem(shelves, itemA);
    const second = findItem(shelves, itemB);
    const failure = await swapBooks(itemA, itemB);
    if (failure) {
      showError(failure.message);
      return failure;
    }
    if (first?.item.book) setMovedBookId(first.item.book.id);
    if (second?.item.book && !first?.item.book) setMovedBookId(second.item.book.id);
    return null;
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
        layouts={layouts}
        drag={drag}
        highlightedBookId={notice?.bookId ?? null}
        movedBookId={movedBookId}
        onOpenBookMenu={openBookMenu}
        onOpenBook={openReader}
        onDragStart={setDrag}
        onDragEnd={() => setDrag(null)}
        onMove={(itemId, shelfId, start) => {
          setDrag(null);
          void handleMove(itemId, shelfId, start);
        }}
        onSwap={(a, b) => {
          setDrag(null);
          void handleSwap(a, b);
        }}
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
        <div
          className={`global-layout__toast${notice.isError ? " global-layout__toast--error" : ""}`}
          role={notice.isError ? "alert" : "status"}
        >
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
            { label: "Move to\u2026", onSelect: () => openBookPanel(menu.book, "moveBook") },
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
      <MoveBookPanel
        isOpen={activePanel === "moveBook"}
        book={selectedBook}
        shelves={shelves}
        onClose={closePanel}
        onMove={handleMove}
        onSwap={handleSwap}
      />
      <BookProblemPanel
        isOpen={activePanel === "bookProblem"}
        book={selectedBook}
        problem={problem}
        onClose={closePanel}
        onRelink={relinkBook}
        onRemove={(book) => openBookPanel(book, "removeBook")}
      />
      <RemoveBookPanel
        isOpen={activePanel === "removeBook"}
        book={selectedBook}
        onClose={closePanel}
        onConfirm={deleteBook}
      />

      {reading && (
        <Reader
          book={reading.book}
          origin={reading.origin}
          onClose={handleReaderClosed}
          onUnavailable={handleReaderUnavailable}
        />
      )}
    </section>
  );
}

export default GlobalLayout;
