import { PDFDocument } from "pdf-lib";

export interface PdfMetadata {
  title: string;
  author: string;
  pages: number;
  size: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function readPdfMetadata(file: File): Promise<PdfMetadata> {
  const pdf = await PDFDocument.load(await file.arrayBuffer(), {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  return {
    title: pdf.getTitle()?.trim() || file.name.replace(/\.pdf$/i, ""),
    author: pdf.getAuthor()?.trim() ?? "",
    pages: pdf.getPageCount(),
    size: formatFileSize(file.size),
  };
}
