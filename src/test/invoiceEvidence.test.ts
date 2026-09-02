import { describe, expect, it, vi } from "vitest";
import {
  getEvidenceFieldHandlers,
  getEvidenceLabel,
  getEvidencePage,
  normalizeEvidenceBox,
  normalizeInvoiceEvidence,
  resolveEvidenceBox,
} from "@/utils/invoiceEvidence";

describe("invoice evidence", () => {
  it("clamps boxes to normalized page bounds and rejects invalid boxes", () => {
    expect(normalizeEvidenceBox({ page: 2.4, x: -0.2, y: 0.25, width: 1.5, height: 0.9 }, 3)).toEqual({
      page: 2,
      x: 0,
      y: 0.25,
      width: 1,
      height: 0.75,
    });
    expect(normalizeEvidenceBox({ page: 0, x: 0, y: 0, width: 1, height: 1 })).toBeNull();
    expect(normalizeEvidenceBox({ page: 1, x: 2, y: 0, width: 0.2, height: 0.2 })).toBeNull();
    expect(normalizeEvidenceBox({ page: 4, x: 0, y: 0, width: 1, height: 1 }, 3)).toBeNull();
    expect(normalizeEvidenceBox({ page: 1, x: 0, y: 0, width: 0, height: 1 })).toBeNull();
  });

  it("resolves exact row-indexed keys and never generic line fields", () => {
    const evidence = normalizeInvoiceEvidence({
      header: { supplier_name: { page: 1, x: 0.1, y: 0.1, width: 0.2, height: 0.04 } },
      lines: [
        { description: { page: 1, x: 0.1, y: 0.4, width: 0.3, height: 0.03 } },
        { description: { page: 2, x: 0.2, y: 0.5, width: 0.4, height: 0.03 } },
      ],
    }, 2);

    expect(resolveEvidenceBox(evidence, "line-0-description")).toEqual(evidence.lines[0].description);
    expect(resolveEvidenceBox(evidence, "line-1-description")).toEqual(evidence.lines[1].description);
    expect(resolveEvidenceBox(evidence, "description")).toBeNull();
    expect(resolveEvidenceBox(evidence, "line-description")).toBeNull();
    expect(getEvidenceLabel("line-0-description")).toBe("Line 1 · Description");
  });

  it("selects the source page from the active box", () => {
    const box = normalizeEvidenceBox({ page: 3, x: 0.2, y: 0.3, width: 0.1, height: 0.1 });
    expect(getEvidencePage(box)).toBe(3);
    expect(getEvidencePage(null)).toBeNull();
  });

  it("keeps legacy scans explicit by returning no evidence", () => {
    const evidence = normalizeInvoiceEvidence(undefined);
    expect(evidence).toEqual({ header: {}, lines: [] });
    expect(resolveEvidenceBox(evidence, "supplier_name")).toBeNull();
  });

  it("keeps one row activation isolated to that row", () => {
    const evidence = normalizeInvoiceEvidence({
      lines: [
        { total: { page: 1, x: 0, y: 0.2, width: 0.2, height: 0.02 } },
        { total: { page: 1, x: 0, y: 0.8, width: 0.2, height: 0.02 } },
      ],
    });
    const activeKey = "line-1-total";
    expect(resolveEvidenceBox(evidence, activeKey)).toEqual(evidence.lines[1].total);
    expect(resolveEvidenceBox(evidence, "line-0-total")).not.toEqual(resolveEvidenceBox(evidence, activeKey));
  });
});

describe("evidence field handlers", () => {
  it("activates on click, pointer down, and focus but never on hover", () => {
    const setActive = vi.fn();
    const handlers = getEvidenceFieldHandlers("line-3-description", setActive);

    expect("onMouseEnter" in handlers).toBe(false);
    expect(handlers.onClick).toBeDefined();
    expect(handlers.onPointerDown).toBeDefined();
    expect(handlers.onFocus).toBeDefined();

    handlers.onClick();
    expect(setActive).toHaveBeenCalledWith("line-3-description");
    handlers.onPointerDown();
    expect(setActive).toHaveBeenCalledTimes(2);
    handlers.onFocus();
    expect(setActive).toHaveBeenCalledTimes(3);
  });

  it("does not include an onMouseEnter property at all", () => {
    const handlers = getEvidenceFieldHandlers("supplier_name", vi.fn());
    const keys = Object.keys(handlers);
    expect(keys).toContain("onClick");
    expect(keys).toContain("onPointerDown");
    expect(keys).toContain("onFocus");
    expect(keys).not.toContain("onMouseEnter");
  });
});
