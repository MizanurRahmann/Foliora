import { open } from "@tauri-apps/plugin-dialog";

// Resolves to the chosen file's path, or null if the user cancelled.
export async function pickPdf(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  return typeof selected === "string" ? selected : null;
}
