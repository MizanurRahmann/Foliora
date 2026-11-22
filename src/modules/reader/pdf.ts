import { GlobalWorkerOptions, getDocument, type PDFDocumentLoadingTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

// vite.config.ts copies these folders from pdfjs-dist into public/pdfjs.
const ASSETS = "/pdfjs/";

// Destroying the task also releases the document and its worker.
export function openPdf(bytes: ArrayBuffer): PDFDocumentLoadingTask {
  return getDocument({
    data: new Uint8Array(bytes),
    cMapUrl: `${ASSETS}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    wasmUrl: `${ASSETS}wasm/`,
    iccUrl: `${ASSETS}iccs/`,
  });
}
