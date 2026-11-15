import { useState } from "react";
import { parseColor } from "../../utils/color";

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}

function ColorField({ label, value, onChange }: ColorFieldProps) {
  // Raw text while typing; null means show the committed hex value.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <label className="add-book__field">
      {label}
      <div className="color-field">
        <input
          type="color"
          value={value}
          onChange={(e) => {
            setDraft(null);
            onChange(e.target.value);
          }}
        />
        <input
          type="text"
          value={draft ?? value}
          placeholder="#hex or rgb(r, g, b)"
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value);
            const parsed = parseColor(e.target.value);
            if (parsed) onChange(parsed);
          }}
          onBlur={() => setDraft(null)}
        />
      </div>
    </label>
  );
}

export default ColorField;
