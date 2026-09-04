import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  PAYMENT_RECEIPT_BUCKET,
  PAYMENT_RECEIPT_MAX_BYTES,
  newlyCreatedPaths,
  paymentReceiptFolder,
  receiptMetadataPayload,
  uploadPaymentReceipts,
  validateReceiptFile,
  validateReceiptFiles,
} from "@/utils/paymentReceipts";
import type { StorageAdapter } from "@/utils/invoiceAttachments";

const TENANT_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const DATE = "2026-09-04";

function src(rel: string) {
  return readFileSync(resolve(__dirname, "..", rel), "utf8");
}

function file(name: string, type: string, bytes: number, content = "x") {
  const blob = new Blob([content.repeat(Math.max(1, Math.min(bytes, 32)))], { type });
  return { name, type, size: bytes, blob };
}

function fakeStorage(existing: Set<string> = new Set(), failOn?: string) {
  const created: string[] = [];
  const removed: string[] = [];
  const adapter: StorageAdapter = {
    upload: async (path) => {
      if (failOn && path.includes(failOn)) return { error: { message: "network died" } };
      if (existing.has(path)) return { error: { message: "The resource already exists", statusCode: "409" } };
      existing.add(path);
      created.push(path);
      return { error: null };
    },
    exists: async (path) => existing.has(path),
    remove: async (paths) => { paths.forEach((p) => { removed.push(p); existing.delete(p); }); return { error: null }; },
  };
  return { adapter, created, removed, existing };
}

describe("receipt validation", () => {
  it("accepts PDF and common images", () => {
    expect(validateReceiptFile({ name: "a.pdf", type: "application/pdf", size: 1000 })).toBeNull();
    expect(validateReceiptFile({ name: "a.jpg", type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validateReceiptFile({ name: "a.png", type: "image/png", size: 1000 })).toBeNull();
    expect(validateReceiptFile({ name: "a.HEIC", type: "", size: 1000 })).toBeNull();
  });

  it("rejects unsupported types and files above 10 MB", () => {
    expect(validateReceiptFile({ name: "a.exe", type: "application/x-msdownload", size: 10 })).toMatch(/only PDF/);
    expect(PAYMENT_RECEIPT_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(validateReceiptFile({ name: "big.pdf", type: "application/pdf", size: PAYMENT_RECEIPT_MAX_BYTES + 1 }))
      .toMatch(/limit is 10 MB/);
    expect(validateReceiptFiles([
      { name: "ok.pdf", type: "application/pdf", size: 10 },
      { name: "bad.exe", type: "", size: 10 },
    ])).toHaveLength(1);
  });
});

describe("tenant-scoped, checksum-addressed paths", () => {
  it("prefixes every object path with the tenant id", () => {
    expect(paymentReceiptFolder(TENANT_A, DATE).startsWith(TENANT_A)).toBe(true);
  });

  it("cannot collide across tenants for identical files", async () => {
    const a = fakeStorage();
    const b = fakeStorage();
    const one = await uploadPaymentReceipts(a.adapter, TENANT_A, DATE, [file("r.pdf", "application/pdf", 100)]);
    const two = await uploadPaymentReceipts(b.adapter, TENANT_B, DATE, [file("r.pdf", "application/pdf", 100)]);
    expect(one[0].path).not.toBe(two[0].path);
    expect(one[0].path.startsWith(TENANT_A)).toBe(true);
    expect(two[0].path.startsWith(TENANT_B)).toBe(true);
    expect(one[0].bucket).toBe(PAYMENT_RECEIPT_BUCKET);
  });

  it("never blindly overwrites: reuses an identical existing object", async () => {
    const first = fakeStorage();
    const stored = await uploadPaymentReceipts(first.adapter, TENANT_A, DATE, [file("r.pdf", "application/pdf", 100)]);
    expect(stored[0].reused).toBe(false);

    const retry = await uploadPaymentReceipts(first.adapter, TENANT_A, DATE, [file("r.pdf", "application/pdf", 100)]);
    expect(retry[0].reused).toBe(true);
    expect(retry[0].path).toBe(stored[0].path);
    expect(newlyCreatedPaths(retry)).toEqual([]);
  });
});

describe("multi-file upload and metadata", () => {
  it("keeps one metadata row per file, in selection order", async () => {
    const s = fakeStorage();
    const stored = await uploadPaymentReceipts(s.adapter, TENANT_A, DATE, [
      file("first.pdf", "application/pdf", 100, "a"),
      file("second.jpg", "image/jpeg", 200, "b"),
    ]);
    const payload = receiptMetadataPayload(stored);
    expect(payload.map((p) => p.original_name)).toEqual(["first.pdf", "second.jpg"]);
    expect(payload.map((p) => p.sort_order)).toEqual([0, 1]);
    expect(payload.every((p) => !!p.checksum && p.bucket === PAYMENT_RECEIPT_BUCKET)).toBe(true);
  });

  it("cleans up only objects created by a failed attempt", async () => {
    const s = fakeStorage(new Set(), "1-");
    await expect(
      uploadPaymentReceipts(s.adapter, TENANT_A, DATE, [
        file("ok.pdf", "application/pdf", 100, "a"),
        file("boom.pdf", "application/pdf", 100, "b"),
      ]),
    ).rejects.toThrow(/Upload failed/);
    expect(s.removed).toHaveLength(1);
    expect(s.removed[0]).toContain("/0-");
  });
});

describe("record payment save contract", () => {
  const dialog = src("components/finance/payables/RecordPaymentDialog.tsx");

  it("keeps the receipt optional and unchanged for the no-receipt path", () => {
    expect(dialog).toContain('const rpcName = receipts.length > 0 ? "record_payment_with_receipts" : "record_payment_with_allocations";');
    expect(dialog).toContain("(optional)");
  });

  it("uploads and verifies receipts before the transaction and cleans up on failure", () => {
    expect(dialog).toContain("uploadPaymentReceipts(");
    expect(dialog).toContain("createdPaths = newlyCreatedPaths(stored)");
    expect(dialog).toContain("remove(createdPaths)");
  });

  it("keeps TBC / unassigned behaviour with receipts attached", () => {
    expect(dialog).toContain("resolvePaidFromAccountId(method, bankAccountId)");
    expect(dialog).toContain("if (!isBankLinkedMethod(m)) setBankAccountId(UNASSIGNED_ACCOUNT);");
  });

  it("lists receipt count and filenames on the confirmation step without bank digits", () => {
    expect(dialog).toContain("payment receipt{receipts.length > 1 ? \"s\" : \"\"} attached:");
    expect(dialog).toContain("receipts.map((f) => f.name).join(\", \")");
    expect(dialog).not.toContain("account_number_last4 ? `•••${b.account_number_last4}` : \"\"}\n                          </SelectItem>\n                        ))}\n                      </SelectContent>\n                    </Select>\n                  </div>\n                )}\n                <div>\n                  <Label>Paid From");
  });
});

describe("receipt viewing surfaces", () => {
  it("shows a compact icon only when receipts exist", () => {
    const indicator = src("components/finance/payables/ReceiptIndicator.tsx");
    expect(indicator).toContain("if (!count) return null;");
  });

  it("offers signed view and download links and reports a missing object", () => {
    const viewer = src("components/finance/payables/PaymentReceiptsDialog.tsx");
    expect(viewer).toContain("createSignedUrl");
    expect(viewer).toContain("download={r.original_name}");
    expect(viewer).toContain("File missing from storage");
  });

  it("is wired into the statement, payments tab and payment history", () => {
    for (const rel of [
      "pages/procurement/SupplierAccount.tsx",
      "pages/finance/Payables.tsx",
      "components/finance/payables/PaymentHistoryDialog.tsx",
    ]) {
      const code = src(rel);
      expect(code, rel).toContain("<ReceiptIndicator");
      expect(code, rel).toContain("PaymentReceiptsDialog");
    }
  });

  it("never renders stale bank digits when the account is unassigned", () => {
    const payables = src("pages/finance/Payables.tsx");
    expect(payables).toContain("paidFromAccountLabel(p.paid_from_account_name)");
  });
});

describe("payment receipts migration", () => {
  const dir = resolve(__dirname, "../../supabase/migrations");
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(resolve(dir, f), "utf8"))
    .find((c) => c.includes("public.payment_receipts")) as string;

  it("creates the table with the required narrow contract", () => {
    expect(sql).toBeTruthy();
    for (const col of ["tenant_id", "payment_id", "bucket", "path", "original_name", "mime_type", "size_bytes", "checksum", "sort_order", "uploaded_by", "uploaded_at"]) {
      expect(sql).toContain(col);
    }
    expect(sql).toMatch(/REFERENCES public\.payments\(id\) ON DELETE CASCADE/);
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_receipts TO authenticated");
    expect(sql).not.toMatch(/GRANT[^;]*payment_receipts TO anon/);
  });

  it("is idempotent and keeps payment + allocations + receipts in one transaction", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.payment_receipts");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.record_payment_with_receipts");
    expect(sql).toContain("public.record_payment_with_allocations(p_payment, p_allocations)");
    expect(sql).toContain("Not a member of this tenant");
    expect(sql).toContain("is not scoped to this tenant");
  });
});
