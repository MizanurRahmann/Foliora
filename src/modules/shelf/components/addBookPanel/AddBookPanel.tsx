import { useState, type ChangeEvent, type CSSProperties } from "react";
import { PiBookOpenDuotone, PiFilePdfDuotone } from "react-icons/pi";
import SidePanel from "../../../global/components/sidePanel/SidePanel";
import type { CoverStyle, NewBookPayload, StorageMode } from "../../types";
import { readPdfMetadata } from "../../utils/readPdfMetadata";
import "./AddBookPanel.scss";
import ColorField from "./ColorField";

interface AddBookPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBook: (payload: NewBookPayload) => void;
}

interface BookForm {
  title: string;
  author: string;
  pages: string;
  size: string;
  primaryColor: string;
  secondaryColor: string;
  coverStyle: CoverStyle;
}

type Step = "upload" | "details" | "storage";

const PAGE_SIZES = ["B5", "A5"];
const DEFAULT_SIZE = "B5";

const COVER_STYLES: { value: CoverStyle; id: string; blocks: number }[] = [
  { value: "bottom-band", id: "style-1", blocks: 1 },
  { value: "center-label", id: "style-2", blocks: 1 },
  { value: "double-stripe", id: "style-3", blocks: 2 },
];

const DEFAULT_COLORS = {
  primaryColor: "#1d3557",
  secondaryColor: "#f1faee"
};

const STORAGE_OPTIONS: { mode: StorageMode; title: string; description: string }[] = [
  {
    mode: "copy",
    title: "Copy the book to your shelf.",
    description: "By copying, the book will be copied and managed from a separate folder.",
  },
  {
    mode: "link",
    title: "Link the book to your shelf.",
    description:
      "By linking, no copy of the book is kept in the shelf space. It just shows the book from your original location.",
  },
];

function AddBookPanel({ isOpen, onClose, onAddBook }: AddBookPanelProps) {
  const [step, setStep] = useState<Step>("upload");
  const [form, setForm] = useState<BookForm | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: string } | null>(null);
  const [storageMode, setStorageMode] = useState<StorageMode | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep("upload");
    setForm(null);
    setFileInfo(null);
    setStorageMode(null);
    setError(null);
    setIsReading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    setError(null);
    setIsReading(true);
    try {
      const meta = await readPdfMetadata(file);
      setForm({
        title: meta.title,
        author: meta.author,
        pages: String(meta.pages),
        size: DEFAULT_SIZE,
        coverStyle: COVER_STYLES[0].value,
        ...DEFAULT_COLORS
      });
      setFileInfo({ name: file.name, size: meta.size });
    } catch {
      setError("Could not read this PDF. Please choose another file.");
    } finally {
      setIsReading(false);
    }
  };

  const updateForm = (field: keyof BookForm, value: string) =>
    setForm((current) => (current ? { ...current, [field]: value } : current));

  const handleSubmit = () => {
    if (!form || !fileInfo || !storageMode) return;

    onAddBook({
      title: form.title.trim(),
      author: form.author.trim(),
      pages: Number(form.pages) || 0,
      size: form.size,
      primaryColor: form.primaryColor,
      secondaryColor: form.secondaryColor,
      coverStyle: form.coverStyle,
      storageMode,
      file: fileInfo,
    });
    handleClose();
  };

  const setField =
    (field: keyof BookForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      updateForm(field, e.target.value);

  const footer =
    step === "upload" ? (
      <button
        type="button"
        className="add-book__button add-book__button--primary"
        disabled={!form}
        onClick={() => setStep("details")}
      >
        Go to Next
      </button>
    ) : step === "details" ? (
      <>
        <button
          type="button"
          className="add-book__button add-book__button--w30"
          onClick={() => setStep("upload")}
        >
          Back
        </button>
        <button
          type="button"
          className="add-book__button add-book__button--primary add-book__button--w70"
          onClick={() => setStep("storage")}
        >
          Next
        </button>
      </>
    ) : (
      <>
        <button
          type="button"
          className="add-book__button add-book__button--w30"
          onClick={() => setStep("details")}
        >
          Back
        </button>
        <button
          type="button"
          className="add-book__button add-book__button--primary add-book__button--w70"
          disabled={!storageMode}
          onClick={handleSubmit}
        >
          Add Book
        </button>
      </>
    );

  return (
    <SidePanel isOpen={isOpen} title="Add New Book" onClose={handleClose} footer={footer}>
      {step === "upload" ? (
        <>
          <label className="add-book__dropzone">
            <PiBookOpenDuotone />
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="add-book__input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleFile(file);
              }}
            />
            <span className="add-book__dropzone-title">Add Book to Shelf</span>
            <span className="add-book__dropzone-hint">
              {isReading ? "Reading metadata..." : "Select a PDF from your device to add to the shelf"}
            </span>
            {error && <span className="add-book__error">{error}</span>}
          </label>

          {fileInfo && (
            <div className="add-book__file">
              <PiFilePdfDuotone className="add-book__file-icon" />
              <div className="add-book__file-meta">
                <span className="add-book__file-name">{fileInfo.name}</span>
                <span className="add-book__file-size">{fileInfo.size}</span>
              </div>
            </div>
          )}
        </>
      ) : step === "storage" ? (
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
      ) : form && (
        <form className="add-book__form" onSubmit={(e) => e.preventDefault()}>
          <label className="add-book__field">
            Book name
            <input type="text" value={form.title} onChange={setField("title")} />
          </label>
          <label className="add-book__field">
            Author
            <input type="text" value={form.author} onChange={setField("author")} />
          </label>
          <div className="add-book__row">
            <label className="add-book__field">
              Pages
              <input type="number" min={1} value={form.pages} onChange={setField("pages")} />
            </label>
            <label className="add-book__field">
              Size
              <select value={form.size} onChange={setField("size")}>
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <h3>Book Cover Colors</h3>
          <div className="add-book__row-wrapper">
            <div className="add-book__row">
              <ColorField
                label="Primary color"
                value={form.primaryColor}
                onChange={(hex) => updateForm("primaryColor", hex)}
              />
              <ColorField
                label="Secondary color"
                value={form.secondaryColor}
                onChange={(hex) => updateForm("secondaryColor", hex)}
              />
            </div>
          </div>

          <h3>Book Cover Styles</h3>
          <div className="add-book__row-wrapper">

            <div
              className="styles"
              role="radiogroup"
              aria-label="Book cover style"
              style={
                {
                  "--primary": form.primaryColor,
                  "--secondary": form.secondaryColor,
                } as CSSProperties
              }
            >
              {COVER_STYLES.map((style) => {
                const selected = form.coverStyle === style.value;
                return (
                  <div
                    key={style.value}
                    id={style.id}
                    role="radio"
                    tabIndex={0}
                    aria-checked={selected}
                    className={`style${selected ? " style--selected" : ""}`}
                    onClick={() => updateForm("coverStyle", style.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        updateForm("coverStyle", style.value);
                      }
                    }}
                  >
                    {Array.from({ length: style.blocks }, (_, i) => (
                      <div key={i} className="block"></div>
                    ))}
                  </div>
                );
              })}
            </div>


          </div>

        </form>
      )}
    </SidePanel>
  );
}

export default AddBookPanel;
