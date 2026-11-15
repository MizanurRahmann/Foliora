// Accepts "#abc", "#aabbcc", "rgb(1, 2, 3)" or "1, 2, 3"; returns "#rrggbb" or null.
export function parseColor(input: string): string | null {
  const text = input.trim().toLowerCase();

  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return `#${digits}`;
  }

  const rgb = /^(?:rgb\()?\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*\)?$/.exec(text);
  if (rgb) {
    const channels = rgb.slice(1, 4).map(Number);
    if (channels.some((c) => c > 255)) return null;
    return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  }

  return null;
}
