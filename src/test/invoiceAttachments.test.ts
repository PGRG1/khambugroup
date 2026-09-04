import { describe, it, expect, vi } from "vitest";
import {
  buildAttachmentPaths,
  hasDurableAttachment,
  parseAttachmentPaths,
  uploadInvoiceSources,
  attachmentsToColumns,
  AttachmentUploadError,
  type StorageAdapter,
  type UploadableSource,
} from "@/utils/invoiceAttachments";

const src = (name: string): UploadableSource => ({ name, type: "image/jpeg", size: 10, blob: new Blob(["x"]) });

function adapter(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    upload: vi.fn(async () => ({ error: null })),
    exists: vi.fn(async () => true),
    ...overrides,
  };
}

describe("invoice attachment paths", () => {
  it("keeps multi-file order with page suffixes", () => {
    expect(buildAttachmentPaths("2026-08-17", "16418", [src("a.jpeg"), src("b.pdf")])).toEqual([
      "2026-08-17/16418_page1.jpeg",
      "2026-08-17/16418_page2.pdf",
    ]);
  });

  it("is idempotent across retries (stable keys)", () => {
    const a = buildAttachmentPaths("2026-08-17", "16418", [src("a.jpeg")]);
    const b = buildAttachmentPaths("2026-08-17", "16418", [src("a.jpeg")]);
    expect(a).toEqual(b);
  });

  it("ignores blob/data URLs as non-durable", () => {
    expect(hasDurableAttachment("blob:http://x/y")).toBe(false);
    expect(hasDurableAttachment(null)).toBe(false);
    expect(hasDurableAttachment("2026-08-17/16418.jpeg")).toBe(true);
    expect(parseAttachmentPaths("a.jpg, b.jpg")).toEqual(["a.jpg", "b.jpg"]);
  });
});

describe("uploadInvoiceSources", () => {
  it("uploads before returning linkage data, in order", async () => {
    const st = adapter();
    const stored = await uploadInvoiceSources(st, "2026-08-17", "16418", [src("a.jpeg"), src("b.jpeg")]);
    expect(stored.map((s) => s.order)).toEqual([0, 1]);
    expect(attachmentsToColumns(stored).file_url).toBe("2026-08-17/16418_page1.jpeg,2026-08-17/16418_page2.jpeg");
    expect(st.upload).toHaveBeenCalledTimes(2);
  });

  it("throws when upload fails so no invoice can be created", async () => {
    const st = adapter({ upload: vi.fn(async () => ({ error: { message: "network" } })) });
    await expect(uploadInvoiceSources(st, "2026-08-17", "16418", [src("a.jpeg")])).rejects.toBeInstanceOf(AttachmentUploadError);
  });

  it("throws when the object cannot be verified after upload", async () => {
    const st = adapter({ exists: vi.fn(async () => false) });
    await expect(uploadInvoiceSources(st, "2026-08-17", "16418", [src("a.jpeg")])).rejects.toThrow(/could not be verified/);
  });

  it("refuses an empty source list", async () => {
    await expect(uploadInvoiceSources(adapter(), "2026-08-17", "16418", [])).rejects.toThrow(/No source document/);
  });

  it("does not create linkage for later files when an earlier one fails", async () => {
    let call = 0;
    const st = adapter({
      upload: vi.fn(async () => (++call === 1 ? { error: null } : { error: { message: "boom" } })),
    });
    await expect(uploadInvoiceSources(st, "2026-08-17", "16418", [src("a.jpeg"), src("b.jpeg")])).rejects.toThrow(/boom/);
  });
});
