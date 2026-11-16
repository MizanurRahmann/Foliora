import { useEffect, useState } from "react";

import type { AppError } from "../../../../api/error";
import SidePanel from "../../../global/components/sidePanel/SidePanel";
import type { BookFields, BookSummary } from "../../types";
import { formFromBook, formToFields, isFormValid, type BookForm } from "../../utils/bookForm";
import "../addBookPanel/AddBookPanel.scss";
import BookFormFields from "../addBookPanel/BookFormFields";

interface EditBookPanelProps {
  isOpen: boolean;
  book: BookSummary | null;
  onClose: () => void;
  onSave: (id: number, fields: BookFields) => Promise<AppError | null>;
}

function EditBookPanel({ isOpen, book, onClose, onSave }: EditBookPanelProps) {
  const [form, setForm] = useState<BookForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Start from the saved values each time the panel opens, so abandoned edits are not kept.
  const bookId = book?.id;
  useEffect(() => {
    if (isOpen && book) {
      setForm(formFromBook(book));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, bookId]);

  const handleSave = async () => {
    if (!book || !form) return;
    setIsSaving(true);
    const failure = await onSave(book.id, formToFields(form));
    setIsSaving(false);
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
        className="add-book__button add-book__button--primary add-book__button--w70"
        disabled={!form || !isFormValid(form) || isSaving}
        onClick={() => void handleSave()}
      >
        {isSaving ? "Saving..." : "Save changes"}
      </button>
    </>
  );

  return (
    <SidePanel isOpen={isOpen} title="Edit Book" onClose={onClose} footer={footer}>
      {book && form && (
        <BookFormFields
          form={form}
          pageCount={book.pageCount}
          onChange={(patch) => {
            setError(null);
            setForm({ ...form, ...patch });
          }}
        />
      )}
      {error && (
        <p className="add-book__error" role="alert">
          {error}
        </p>
      )}
    </SidePanel>
  );
}

export default EditBookPanel;
