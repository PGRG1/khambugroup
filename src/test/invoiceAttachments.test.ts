import { describe, it, expect, vi } from "vitest";
import {
  buildAttachmentPath,
  buildAttachmentPaths,
  checksumOf,
  hasDurableAttachment,
  parseAttachmentPaths,
  uploadInvoiceSources,
  attachmentsToColumns,
  newlyCreatedPaths,
  AttachmentUploadError,
  type StorageAdapter,
  type UploadableSource,
} from "@/utils/invoiceAttachments";

const T1 = "11111111-1111-1111-1111-111111111111";
const T2 = "22222222-2222-2222-2222-222222222222";

const src = (name: string, content = "alpha"): UploadableSource => ({
  name,
  type: "image/jpeg",
  size: content.length,
  blob: new Blob([content]),
});

function adapter(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    upload: vi.fn(async () => ({ error: null })),
    exists: vi.fn(async () => true),
    remove: vi.fn(async () => ({ error: null })),
    ...overrides,
  };
}

describe("tenant-scoped, content-addressed paths", () => {
  it("cannot collide across tenants for the same date and invoice number", async () => {
    const a = await buildAttachmentPaths(T1, "2026-08-17", "16418", [src("a.jpeg")]);
    const b = await buildAttachmentPaths(T2, "2026-08-17", "16418", [src("a.jpeg")]);
    expect(a[0].path.startsWith(T1)).toBe(true);
    expect(b[0].path.startsWith(T2)).toBe(true);
    expect(a[0].path).not.toBe(b[0].path);
  });

  it("cannot collide for different binaries with identical names", async () => {
    const a = await buildAttachmentPaths(T1, "2026-08-17", "16418", [src("a.jpeg", "one")]);
    const b = await buildAttachmentPaths(T1, "2026-08-17", "16418", [src("a.jpeg", "two")]);
    expect(a[0].checksum).not.toBe(b[0].checksum);
    expect(a[0].path).not.toBe(b[0].path);
  });

  it("re-uses the exact same key when the same binary is retried", async () => {
    const a = await buildAttachmentPaths(T1, "2026-08-17", "16418", [src("a.jpeg", "same")]);
    const b = await buildAttachmentPaths(T1, "2026-08-17", "16418", [src("a.jpeg", "same")]);
    expect(a[0].path).toBe(b[0].path);
  });

  it("requires a tenant", async () => {
    expect(() => buildAttachmentPath("", "2026-08-17", "1", 0, "abc", "a.jpg")).toThrow(/Tenant is required/);
  });

  it("keeps multi-file order in the key", async () => {
    const paths = await buildAttachmentPaths(T1, "2026-08-17", "16418", [src("a.jpeg", "1"), src("b.pdf", "2")]);
    expect(paths[0].path).toMatch(/\/0-[0-9a-f]{16}\.jpeg$/);
    expect(paths[1].path).toMatch(/\/1-[0-9a-f]{16}\.pdf$/);
  });

  it("ignores blob/data URLs as non-durable", () => {
    expect(hasDurableAttachment("blob:http://x/y")).toBe(false);
    expect(hasDurableAttachment(null)).toBe(false);
    expect(hasDurableAttachment(`${T1}/2026-08-17/16418/0-abc.jpeg`)).toBe(true);
    expect(parseAttachmentPaths("a.jpg, b.jpg")).toEqual(["a.jpg", "b.jpg"]);
  });

  it("hashes content deterministically", async () => {
    expect(await checksumOf(new Blob(["x"]))).toBe(await checksumOf(new Blob(["x"])));
  });
});

describe("uploadInvoiceSources", () => {
  it("uploads and verifies every file before returning linkage metadata", async () => {
    const st = adapter();
    const stored = await uploadInvoiceSources(st, T1, "2026-08-17", "16418", [src("a.jpeg", "1"), src("b.jpeg", "2")]);
    expect(stored.map((s) => s.sort_order)).toEqual([0, 1]);
    expect(stored.map((s) => s.original_name)).toEqual(["a.jpeg", "b.jpeg"]);
    expect(stored.every((s) => s.mime_type === "image/jpeg" && s.size_bytes > 0 && s.checksum.length === 64)).toBe(true);
    expect(st.exists).toHaveBeenCalledTimes(2);
    const cols = attachmentsToColumns(stored);
    expect(cols.file_url.split(",")).toEqual([stored[0].path, stored[1].path]);
    expect(cols.file_name).toBe("a.jpeg, b.jpeg");
  });

  it("never blindly overwrites (upsert disabled)", async () => {
    const st = adapter();
    await uploadInvoiceSources(st, T1, "2026-08-17", "16418", [src("a.jpeg")]);
    expect((st.upload as any).mock.calls[0][2].upsert).toBe(false);
  });

  it("treats an existing checksum path as an idempotent retry", async () => {
    const st = adapter({ upload: vi.fn(async () => ({ error: { message: "The resource already exists" } })) });
    const stored = await uploadInvoiceSources(st, T1, "2026-08-17", "16418", [src("a.jpeg")]);
    expect(stored[0].reused).toBe(true);
    expect(newlyCreatedPaths(stored)).toEqual([]);
    expect(st.remove).not.toHaveBeenCalled();
  });

  it("throws when upload fails so no invoice can be created", async () => {
    const st = adapter({ upload: vi.fn(async () => ({ error: { message: "network" } })) });
    await expect(uploadInvoiceSources(st, T1, "2026-08-17", "16418", [src("a.jpeg")])).rejects.toBeInstanceOf(AttachmentUploadError);
  });

  it("throws when the object cannot be verified after upload", async () => {
    const st = adapter({ exists: vi.fn(async () => false) });
    await expect(uploadInvoiceSources(st, T1, "2026-08-17", "16418", [src("a.jpeg")])).rejects.toThrow(/could not be verified/);
  });

  it("removes only objects created by a failed attempt", async () => {
    let call = 0;
    const st = adapter({
      upload: vi.fn(async () => (++call === 1 ? { error: null } : { error: { message: "boom" } })),
    });
    await expect(uploadInvoiceSources(st, T1, "2026-08-17", "16418", [src("a.jpeg", "1"), src("b.jpeg", "2")])).rejects.toThrow(/boom/);
    const removed = (st.remove as any).mock.calls[0][0];
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatch(/\/0-/);
  });

  it("never deletes a reused pre-existing object during cleanup", async () => {
    let call = 0;
    const st = adapter({
      upload: vi.fn(async () =>
        ++call === 1 ? { error: { message: "already exists" } } : { error: { message: "boom" } },
      ),
    });
    await expect(uploadInvoiceSources(st, T1, "2026-08-17", "16418", [src("a.jpeg", "1"), src("b.jpeg", "2")])).rejects.toThrow(/boom/);
    expect(st.remove).not.toHaveBeenCalled();
  });

  it("refuses an empty source list and a missing tenant", async () => {
    await expect(uploadInvoiceSources(adapter(), T1, "2026-08-17", "16418", [])).rejects.toThrow(/No source document/);
    await expect(uploadInvoiceSources(adapter(), "", "2026-08-17", "16418", [src("a.jpeg")])).rejects.toThrow(/Tenant is required/);
  });
});
