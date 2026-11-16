import { useEffect, useState } from "react";

import { pickPdf } from "../../../../api/dialog";
import type { AppError } from "../../../../api/error";
import SidePanel from "../../../global/components/sidePanel/SidePanel";
import { bookSpan } from "../../placement";
import type { BookSummary } from "../../types";
import { formatBytes } from "../../utils/format";
import "../addBookPanel/AddBookPanel.scss";
import "./BookPanels.scss";

interface BookInfoPanelProps {
  isOpen: boolean;
  book: BookSummary | null;
  onClose: () => void;
  onRelink: (id: number, path: string, acceptChanged: boolean) => Promise<AppError | null>;
}

function BookInfoPanel({ isOpen, book, onClose, onRelink }: BookInfoPanelProps) {
  const [error, setError] = useState<string | null>(null);
  // A replacement file whose content differs from the original, waiting for the user's go-ahead.
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
    if (!failure) {
      setError(null);
      setPendingPath(null);
    } else if (failure.code === "FILE_CHANGED") {
      setError(null);
      setPendingPath(path);
    } else {
      setError(failure.message);
      setPendingPath(null);
    }
  };

  const handleLocate = async () => {
    const path = await pickPdf();
    if (path) await relink(path, false);
  };

  const footer = (
    <button type="button" className="add-book__button add-book__button--w60" onClick={onClose}>
      Close
    </button>
  );

  const span = book ? bookSpan(book.bookSize, book.orientation, book.pageCount) : 0;
  const isMissing = book?.fileStatus === "MISSING";

  return (
    <SidePanel isOpen={isOpen} title="Book Details" onClose={onClose} footer={footer}>
      {book && (
        <div className="book-panel">
          <h2 className="book-panel__title">{book.title}</h2>
          <dl className="book-panel__list">
            <dt>Author</dt>
            <dd>{book.author ?? "Unknown"}</dd>
            <dt>Pages</dt>
            <dd>{book.pageCount}</dd>
            <dt>Size</dt>
            <dd>
              {book.bookSize}, {book.orientation === "VERTICAL" ? "standing" : "lying down"}
            </dd>
            <dt>Shelf space</dt>
            <dd>{span === 1 ? "1 space" : `${span} spaces`}</dd>
            <dt>File</dt>
            <dd>
              {book.originalFileName} ({formatBytes(book.fileSizeBytes)})
            </dd>
            <dt>Storage</dt>
            <dd>{book.storageMode === "COPY" ? "Copied into Foliora" : "Linked to the original file"}</dd>
            <dt>Added</dt>
            <dd>{book.createdAt.slice(0, 10)}</dd>
          </dl>

          {isMissing && (
            <div className="book-panel__missing" role="alert">
              {book.storageMode === "LINK" ? (
                <>
                  <p>The linked PDF could not be found. It may have been moved, renamed or deleted.</p>
                  <button type="button" className="add-book__button" onClick={() => void handleLocate()}>
                    Locate file...
                  </button>
                </>
              ) : (
                <p>The stored copy is missing from Foliora&rsquo;s folder. You can remove this book.</p>
              )}
            </div>
          )}

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

export default BookInfoPanel;
