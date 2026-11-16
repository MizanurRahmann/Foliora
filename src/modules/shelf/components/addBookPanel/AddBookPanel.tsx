import { useState } from "react";
import { PiBookOpenDuotone, PiFilePdfDuotone } from "react-icons/pi";

import { pickPdf } from "../../../../api/dialog";
import { inspectPdf } from "../../../../api/books";
import { toAppError, type AppError } from "../../../../api/error";
import SidePanel from "../../../global/components/sidePanel/SidePanel";
import type { AddBookRequest, PdfInspection, StorageMode } from "../../types";
import { formToFields, isFormValid, newBookForm, type BookForm } from "../../utils/bookForm";
import { formatBytes } from "../../utils/format";
import "./AddBookPanel.scss";
import BookFormFields from "./BookFormFields";

interface AddBookPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBook: (request: AddBookRequest) => Promise<AppError | null>;
}

type Step = "upload" | "details" | "storage";

interface Chosen {
  path: string;
  info: PdfInspection;
}

const STORAGE_OPTIONS: { mode: StorageMode; title: string; description: string }[] = [
  {
    mode: "COPY",
    title: "Copy the book to your shelf.",
    description: "By copying, the book will be copied and managed from a separate folder.",
  },
  {
    mode: "LINK",
    title: "Link the book to your shelf.",
    description:
      "By linking, no copy of the book is kept in the shelf space. It just shows the book from your original location.",
  },
];

function AddBookPanel({ isOpen, onClose, onAddBook }: AddBookPanelProps) {
  const [step, setStep] = useState<Step>("upload");
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [form, setForm] = useState<BookForm | null>(null);
  const [storageMode, setStorageMode] = useState<StorageMode | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep("upload");
    setChosen(null);
    setForm(null);
    setStorageMode(null);
    setError(null);
    setIsReading(false);
    setIsSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleChoose = async () => {
    setError(null);
    try {
      const path = await pickPdf();
      if (!path) return;
      setIsReading(true);
      const info = await inspectPdf(path);
      setChosen({ path, info });
      setForm(newBookForm(info));
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      setIsReading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form || !chosen || !storageMode) return;
    setIsSaving(true);
    setError(null);
    const failure = await onAddBook({
      sourcePath: chosen.path,
      storageMode,
      ...formToFields(form),
    });
    setIsSaving(false);
    if (failure) setError(failure.message);
    else handleClose();
  };

  const goTo = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const footer =
    step === "upload" ? (
      <button
        type="button"
        className="add-book__button add-book__button--primary"
        disabled={!form}
        onClick={() => goTo("details")}
      >
        Go to Next
      </button>
    ) : step === "details" ? (
      <>
        <button type="button" className="add-book__button add-book__button--w30" onClick={() => goTo("upload")}>
          Back
        </button>
        <button
          type="button"
          className="add-book__button add-book__button--primary add-book__button--w70"
          disabled={!form || !isFormValid(form)}
          onClick={() => goTo("storage")}
        >
          Next
        </button>
      </>
    ) : (
      <>
        <button type="button" className="add-book__button add-book__button--w30" onClick={() => goTo("details")}>
          Back
        </button>
        <button
          type="button"
          className="add-book__button add-book__button--primary add-book__button--w70"
          disabled={!storageMode || isSaving}
          onClick={() => void handleSubmit()}
        >
          {isSaving ? "Adding..." : "Add Book"}
        </button>
      </>
    );

  return (
    <SidePanel isOpen={isOpen} title="Add New Book" onClose={handleClose} footer={footer}>
      {step === "upload" && (
        <>
          <button type="button" className="add-book__dropzone" onClick={() => void handleChoose()} disabled={isReading}>
            <PiBookOpenDuotone />
            <span className="add-book__dropzone-title">Add Book to Shelf</span>
            <span className="add-book__dropzone-hint">
              {isReading ? "Reading the PDF..." : "Select a PDF from your device to add to the shelf"}
            </span>
          </button>

          {chosen && (
            <div className="add-book__file">
              <PiFilePdfDuotone className="add-book__file-icon" />
              <div className="add-book__file-meta">
                <span className="add-book__file-name">{chosen.info.fileName}</span>
                <span className="add-book__file-size">
                  {formatBytes(chosen.info.sizeBytes)} · {chosen.info.pageCount} pages
                </span>
              </div>
            </div>
          )}

          {chosen?.info.duplicateOf && (
            <p className="add-book__warning" role="status">
              A book with the same content, &ldquo;{chosen.info.duplicateOf.title}&rdquo;, is already on your
              shelves. You can still add it again, or close this panel to cancel.
            </p>
          )}
        </>
      )}

      {step === "details" && form && chosen && (
        <BookFormFields
          form={form}
          pageCount={chosen.info.pageCount}
          onChange={(patch) => setForm({ ...form, ...patch })}
        />
      )}

      {step === "storage" && (
        <div className="add-book__options" role="radiogroup">
          {STORAGE_OPTIONS.map((option) => {
            const selected = storageMode === option.mode;
            return (
              <div
                key={option.mode}
                role="radio"
                tabIndex={0}
                aria-checked={selected}
                className={`add-book__option${selected ? " add-book__option--selected" : ""}`}
                onClick={() => setStorageMode(option.mode)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setStorageMode(option.mode);
                  }
                }}
              >
                <h1>{option.title}</h1>
                <p>{option.description}</p>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <p className="add-book__error" role="alert">
          {error}
        </p>
      )}
    </SidePanel>
  );
}

export default AddBookPanel;
