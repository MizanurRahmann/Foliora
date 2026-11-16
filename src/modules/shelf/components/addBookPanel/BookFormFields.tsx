import type { CSSProperties } from "react";

import type { BookSize, Orientation } from "../../placement";
import type { CoverStyle } from "../../types";
import { formSpan, type BookForm } from "../../utils/bookForm";
import ColorField from "./ColorField";

interface BookFormFieldsProps {
  form: BookForm;
  pageCount: number;
  onChange: (patch: Partial<BookForm>) => void;
}

const COVER_STYLES: { value: CoverStyle; id: string; label: string; blocks: number }[] = [
  { value: "BOTTOM_BAND", id: "style-1", label: "Bottom band", blocks: 1 },
  { value: "CENTER_LABEL", id: "style-2", label: "Center label", blocks: 1 },
  { value: "DOUBLE_STRIPE", id: "style-3", label: "Double stripe", blocks: 2 },
];

const BOOK_SIZES: BookSize[] = ["B5", "A5"];

const ORIENTATIONS: { value: Orientation; label: string }[] = [
  { value: "VERTICAL", label: "Standing" },
  { value: "HORIZONTAL", label: "Lying down" },
];

function BookFormFields({ form, pageCount, onChange }: BookFormFieldsProps) {
  const span = formSpan(form, pageCount);

  return (
    <form className="add-book__form" onSubmit={(e) => e.preventDefault()}>
      <label className="add-book__field">
        Book name
        <input
          type="text"
          value={form.title}
          maxLength={200}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </label>
      <label className="add-book__field">
        Author
        <input
          type="text"
          value={form.author}
          maxLength={200}
          onChange={(e) => onChange({ author: e.target.value })}
        />
      </label>

      <div className="add-book__row">
        <label className="add-book__field">
          Pages
          <input type="number" value={pageCount} readOnly disabled />
        </label>
        <label className="add-book__field">
          Size
          <select
            value={form.bookSize}
            onChange={(e) => onChange({ bookSize: e.target.value as BookSize })}
          >
            {BOOK_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <label className="add-book__field">
          Orientation
          <select
            value={form.orientation}
            onChange={(e) => onChange({ orientation: e.target.value as Orientation })}
          >
            {ORIENTATIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="add-book__hint">
        This book takes {span} {span === 1 ? "space" : "spaces"} on a shelf.
      </p>

      <h3>Book Cover Colors</h3>
      <div className="add-book__row-wrapper">
        <div className="add-book__row">
          <ColorField
            label="Primary color"
            value={form.primaryColor}
            onChange={(hex) => onChange({ primaryColor: hex })}
          />
          <ColorField
            label="Secondary color"
            value={form.secondaryColor}
            onChange={(hex) => onChange({ secondaryColor: hex })}
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
                aria-label={style.label}
                className={`style${selected ? " style--selected" : ""}`}
                onClick={() => onChange({ coverStyle: style.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onChange({ coverStyle: style.value });
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
  );
}

export default BookFormFields;
