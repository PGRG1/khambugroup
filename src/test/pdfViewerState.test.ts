import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_CANVAS_DPR, canvasBackingSize, clampPdfPage, evidencePdfPage, resetForFileChange, resolveNavigation } from "@/utils/pdfViewerState";

describe("clampPdfPage", () => {
  it("clamps into range", () => {
    expect(clampPdfPage(0, 5)).toBe(1);
    expect(clampPdfPage(9, 5)).toBe(5);
    expect(clampPdfPage(3, 5)).toBe(3);
    expect(clampPdfPage(Number.NaN, 5)).toBe(1);
  });
});

describe("canvasBackingSize", () => {
  it("scales the backing store while logical size is untouched", () => {
    const logical = { width: 612, height: 792 };
    const backing = canvasBackingSize(logical, 2);
    expect(backing).toEqual({ scale: 2, width: 1224, height: 1584 });
    expect(logical).toEqual({ width: 612, height: 792 });
  });

  it("never goes below 1x and caps the DPR", () => {
    expect(canvasBackingSize({ width: 100, height: 100 }, 0.5).scale).toBe(1);
    expect(canvasBackingSize({ width: 100, height: 100 }, 8).scale).toBe(MAX_CANVAS_DPR);
  });
});

describe("resolveNavigation", () => {
  it("paginates a single multi-page PDF by PDF page", () => {
    expect(resolveNavigation(1, true, 7, 0, 3)).toEqual({ mode: "pdf", current: 3, total: 7 });
  });

  it("paginates images / multiple files by file", () => {
    expect(resolveNavigation(4, false, 1, 2, 1)).toEqual({ mode: "file", current: 3, total: 4 });
    expect(resolveNavigation(3, true, 9, 1, 4)).toEqual({ mode: "pdf", current: 4, total: 9 });
  });
});

describe("evidencePdfPage", () => {
  it("selects the evidence page for a single PDF", () => {
    expect(evidencePdfPage(4, 6, 1)).toBe(4);
    expect(evidencePdfPage(99, 6, 1)).toBe(6);
    expect(evidencePdfPage(undefined, 6, 2)).toBe(2);
  });
});

describe("resetForFileChange", () => {
  it("resets page, rotation and fit", () => {
    expect(resetForFileChange()).toEqual({ pdfPage: 1, rotation: 0, fitMode: "page" });
  });
});

describe("SourceDocumentViewer wiring", () => {
  const source = readFileSync("src/components/invoices/SourceDocumentViewer.tsx", "utf8");
  const canvas = readFileSync("src/components/invoices/PdfPageCanvas.tsx", "utf8");

  it("no longer uses an iframe or the old PDF evidence message", () => {
    expect(source).not.toContain("<iframe");
    expect(source).not.toContain("PDF location preview requires");
  });

  it("keeps the honest legacy fallback message", () => {
    expect(source).toContain("Location unavailable — rescan to enable source highlighting.");
  });

  it("renders PDFs inside the shared transform stage", () => {
    const stage = source.indexOf("translate(-50%, -50%) rotate(");
    expect(stage).toBeGreaterThan(-1);
    expect(source.indexOf("<PdfPageCanvas")).toBeGreaterThan(stage);
    expect(source.indexOf("activeBox && activeBox.page === displayPage")).toBeGreaterThan(source.indexOf("<PdfPageCanvas"));
  });

  it("cancels render tasks and destroys documents on cleanup", () => {
    expect(canvas).toContain("renderTaskRef.current?.cancel()");
    expect(canvas).toContain("doc?.destroy()");
    expect(canvas).toContain('aria-label={`${fileName} — page ${pageNumber}`}');
  });
});
