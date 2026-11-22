import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error type error without @types/node package
import { cpSync } from "node:fs";

const host = process.env.TAURI_DEV_HOST;

const PDFJS_FOLDERS = ["cmaps", "standard_fonts", "wasm", "iccs"];
const copyPdfjsAssets = () => ({
  name: "copy-pdfjs-assets",
  buildStart() {
    for (const folder of PDFJS_FOLDERS) {
      cpSync(`node_modules/pdfjs-dist/${folder}`, `public/pdfjs/${folder}`, { recursive: true });
    }
  },
});

export default defineConfig(() => ({
  plugins: [react(), copyPdfjsAssets()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
