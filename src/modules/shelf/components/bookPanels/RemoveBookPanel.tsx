import { useEffect, useState } from "react";

import type { AppError } from "../../../../api/error";
import SidePanel from "../../../global/components/sidePanel/SidePanel";
import type { BookSummary } from "../../types";
import "../addBookPanel/AddBookPanel.scss";
import "./BookPanels.scss";

interface RemoveBookPanelProps {
  isOpen: boolean;
  book: BookSummary | null;
  onClose: () => void;
  onConfirm: (id: number, deleteFile: boolean) => Promise<AppError | null>;
}

function RemoveBookPanel({ isOpen, book, onClose, onConfirm }: RemoveBookPanelProps) {
  const [deleteFile, setDeleteFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDeleteFile(false);
      setError(null);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!book) return;
    setIsRemoving(true);
    const failure = await onConfirm(book.id, deleteFile);
    setIsRemoving(false);
    if (failure) setError(failure.message);
    else onClose();
  };

  const footer = (
    <>
      <button type="button" className="add-book__button add-book__button--w30" onClick={onClose}>
        Cancel
      </button>
      <button
        type="button"
        className="add-book__button add-book__button--danger add-book__button--w70"
        disabled={!book || isRemoving}
        onClick={() => void handleConfirm()}
      >
        {isRemoving ? "Removing..." : "Remove book"}
      </button>
    </>
  );

  return (
    <SidePanel isOpen={isOpen} title="Remove Book" onClose={onClose} footer={footer}>
      {book && (
        <div className="book-panel">
          <p>
            Remove <strong>{book.title}</strong> from your shelves? Its space becomes free.
          </p>

          {book.storageMode === "COPY" ? (
            <label className="book-panel__check">
              <input type="checkbox" checked={deleteFile} onChange={(e) => setDeleteFile(e.target.checked)} />
              <span>
                Also delete the stored copy of the PDF
                <small>If unchecked, the copy stays in Foliora&rsquo;s folder.</small>
              </span>
            </label>
          ) : (
            <p className="book-panel__note">The original PDF is not touched.</p>
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

export default RemoveBookPanel;
