import { useEffect, useState } from "react";

import { pickPdf } from "../../../../api/dialog";
import type { AppError } from "../../../../api/error";
import SidePanel from "../../../global/components/sidePanel/SidePanel";
import type { BookSummary } from "../../types";
import "../addBookPanel/AddBookPanel.scss";
import "./BookPanels.scss";

export type BookProblem = "MISSING" | "UNREADABLE";

interface BookProblemPanelProps {
  isOpen: boolean;
  book: BookSummary | null;
  problem: BookProblem;
  onClose: () => void;
  onRelink: (id: number, path: string, acceptChanged: boolean) => Promise<AppError | null>;
  onRemove: (book: BookSummary) => void;
}

// Shown instead of the reader when a book's PDF is gone or cannot be opened.
function BookProblemPanel({ isOpen, book, problem, onClose, onRelink, onRemove }: BookProblemPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setPendingPath(null);
    }
  }, [isOpen]);

  const relink = async (path: string, acceptChanged: boolean) => {
    if (!book) return;
    const failure = await onRelink(book.id, path, acceptChanged);
    if (!failure) onClose();
    else if (failure.code === "FILE_CHANGED") {
      setError(null);
      setPendingPath(path);
    } else {
      setError(failure.message);
      setPendingPath(null);
    }
  };

  const locate = async () => {
    const path = await pickPdf();
    if (path) await relink(path, false);
  };

  const canRelink = book?.storageMode === "LINK";
  const explanation =
    problem === "MISSING"
      ? canRelink
        ? "The linked PDF could not be found. It may have been moved, renamed or deleted."
        : "The stored copy of this PDF is missing from Foliora’s folder."
      : "This PDF could not be opened. The file may be damaged or no longer a valid PDF.";

  const footer = (
    <button type="button" className="add-book__button add-book__button--w60" onClick={onClose}>
      Close
    </button>
  );

  return (
    <SidePanel isOpen={isOpen} title="Cannot Open Book" onClose={onClose} footer={footer}>
      {book && (
        <div className="book-panel">
          <h2 className="book-panel__title">{book.title}</h2>
          <div className="book-panel__missing" role="alert">
            <p>{explanation}</p>
          </div>

          {canRelink && (
            <button type="button" className="add-book__button add-book__button--primary" onClick={() => void locate()}>
              Locate file...
            </button>
          )}
          <button
            type="button"
            className="add-book__button add-book__button--danger"
            onClick={() => onRemove(book)}
          >
            Remove book...
          </button>

          {pendingPath && (
            <div className="add-book__warning" role="alert">
              <p>This file is different from the one originally added. Use it anyway?</p>
              <button
                type="button"
                className="add-book__button add-book__button--primary"
                onClick={() => void relink(pendingPath, true)}
              >
                Use this file
              </button>
            </div>
          )}

          {error && (
            <p className="add-book__error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </SidePanel>
  );
}

export default BookProblemPanel;
