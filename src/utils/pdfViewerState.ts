import type { Size } from "./invoiceViewerTransform";

export const MAX_CANVAS_DPR = 3;

/** Clamp a 1-based page number into [1, pageCount]. */
export function clampPdfPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page) || pageCount < 1) return 1;
  return Math.min(Math.max(1, Math.round(page)), pageCount);
}

/**
 * Backing store size for a crisp canvas.
 * Logical CSS size stays untouched so transform math is unaffected.
 */
export function canvasBackingSize(logical: Size, devicePixelRatio = 1, maxDpr = MAX_CANVAS_DPR): Size & { scale: number } {
  const scale = Math.min(maxDpr, Math.max(1, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1));
  return {
    scale,
    width: Math.max(1, Math.round(logical.width * scale)),
    height: Math.max(1, Math.round(logical.height * scale)),
  };
}

/**
 * Navigation model shown in the viewer toolbar.
 * A single multi-page PDF paginates by PDF page; otherwise by attached file.
 */
export function resolveNavigation(fileCount: number, isPdf: boolean, pdfPageCount: number, fileIndex: number, pdfPage: number) {
  // The bottom strip handles file selection. Once a PDF is active, the toolbar
  // always navigates its internal pages, even when other files are attached.
  if (isPdf) {
    const total = Math.max(1, pdfPageCount);
    return { mode: "pdf" as const, current: clampPdfPage(pdfPage, total), total };
  }
  return { mode: "file" as const, current: Math.min(fileCount, Math.max(1, fileIndex + 1)), total: Math.max(1, fileCount) };
}

/** Which PDF page should be shown for an evidence box on a single-file PDF. */
export function evidencePdfPage(evidencePage: number | undefined, pageCount: number, currentPage: number): number {
  if (!evidencePage || !Number.isFinite(evidencePage)) return currentPage;
  return clampPdfPage(evidencePage, Math.max(1, pageCount));
}

/** State reset applied whenever the active source file changes. */
export function resetForFileChange() {
  return { pdfPage: 1, rotation: 0, fitMode: "page" as const };
}
