
import { useState } from "react";
import "./GlobalLayout.scss";

import AddBookPanel from "../../../shelf/components/addBookPanel/AddBookPanel";
import Shelf from "../../../shelf/components/shelf/Shelf";
import { SLOTS_PER_SHELF } from "../../../shelf/constants";
import { mockBooks } from "../../../shelf/data/mockBooks";
import type { BookData, NewBookPayload } from "../../../shelf/types";
import { useActivePanel } from "../../hooks/useActivePanel";
import SideMenu from "../menu/SideMenu";

const INITIAL_SHELF_COUNT = 3;

type PanelId = "addBook";

function findFirstFreeSlot(books: BookData[], shelfCount: number) {
  for (let shelfNumber = 1; shelfNumber <= shelfCount; shelfNumber++) {
    for (let position = 1; position <= SLOTS_PER_SHELF; position++) {
      const taken = books.some(
        (book) => book.shelfNumber === shelfNumber && book.position === position,
      );
      if (!taken) return { shelfNumber, position };
    }
  }
  return null;
}

/**
 * Moves a book to the target position.
 * If another book occupies the target position,
 * their positions are swapped.
 */
function moveBookToPosition(
  books: BookData[],
  bookId: string,
  targetShelf: number,
  targetPosition: number,
): BookData[] {
  const movingBook = books.find((book) => book.id === bookId);

  if (!movingBook) return books;

  const targetBook = books.find(
    (book) =>
      book.shelfNumber === targetShelf &&
      book.position === targetPosition,
  );

  if (targetBook?.id === bookId) return books;

  return books.map((book) => {
    if (book.id === bookId) {
      return {
        ...book,
        shelfNumber: targetShelf,
        position: targetPosition,
      };
    }

    if (book.id === targetBook?.id) {
      return {
        ...book,
        shelfNumber: movingBook.shelfNumber,
        position: movingBook.position,
      };
    }

    return book;
  });
}

function GlobalLayout() {
  const [shelfCount, setShelfCount] = useState(INITIAL_SHELF_COUNT);
  const [books, setBooks] = useState<BookData[]>(mockBooks);
  const { activePanel, openPanel, closePanel } = useActivePanel<PanelId>();

  const handleMoveBook = (
    bookId: string,
    shelfNumber: number,
    position: number,
  ) => {
    setBooks((currentBooks) =>
      moveBookToPosition(currentBooks, bookId, shelfNumber, position),
    );
  };

  const handleAddShelf = () => {
    setShelfCount((currentCount) => currentCount + 1);
  };

  // TODO: send the payload to the backend once it exists.
  const handleAddBook = (payload: NewBookPayload) => {
    const slot = findFirstFreeSlot(books, shelfCount) ?? {
      shelfNumber: shelfCount + 1,
      position: 1,
    };
    if (slot.shelfNumber > shelfCount) setShelfCount(slot.shelfNumber);

    setBooks((currentBooks) => [
      ...currentBooks,
      { id: crypto.randomUUID(), ...slot, ...payload },
    ]);
  };

  const shelfNumbers = Array.from(
    { length: shelfCount },
    (_, index) => index + 1,
  );

  return (
    <section className="global-layout">
      {/* Side Menu */}
      <nav className="global-layout__side-menu">
        <SideMenu
          onAddShelf={handleAddShelf}
          onAddBook={() => openPanel("addBook")}
        />
      </nav>

      <div className="global-layout__inner">
        {/* Bookshelves */}
        <div className="global-layout__bookshelf">
          {shelfNumbers.map((shelfNumber) => (
            <Shelf
              key={shelfNumber}
              shelfNumber={shelfNumber}
              books={books.filter(
                (book) => book.shelfNumber === shelfNumber,
              )}
              onMoveBook={handleMoveBook}
            />
          ))}
        </div>
      </div>

      <AddBookPanel
        isOpen={activePanel === "addBook"}
        onClose={closePanel}
        onAddBook={handleAddBook}
      />
    </section>
  );
}

export default GlobalLayout;
