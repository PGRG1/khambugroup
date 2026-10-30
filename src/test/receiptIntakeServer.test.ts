import { describe, expect, it, vi } from "vitest";
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({ resolveTenant: async (_db: unknown, _user: string, tenant: string) => tenant === "11111111-1111-4111-8111-111111111111" ? { tenant_id: tenant } : null }));
// Runtime-only import keeps Deno's npm specifiers outside the browser type graph.
const intakeModule = "../../supabase/functions/parse-receipt/intake.ts";
const { receiptIntake } = await import(intakeModule);
import { sha256 } from "../../supabase/functions/_shared/salesEvidence";
const tenant = "11111111-1111-4111-8111-111111111111";
const scanId = "22222222-2222-4222-8222-222222222222";
const input = { tenantId: tenant, scanId: null, imageBase64: btoa("receipt"), mimeType: "image/png", fileName: "receipt.png", tentative: { venue: "Assembly", date: "2026-10-12", totalSales: 100 } };
function db(options: { denied?: boolean; scanHash?: string; previous?: boolean; uploadFails?: boolean; registerFails?: boolean } = {}) {
  const rpc = vi.fn(async (name: string) => name === "register_sales_receipt_intake" ? { data: options.registerFails ? null : { status: "flagged", intakeId: "i", repeated: false }, error: options.registerFails ? new Error("register failed") : null } : { data: !options.denied });
  const upload = vi.fn(async () => ({ error: options.uploadFails ? new Error("upload failed") : null }));
  const tables: string[] = [];
  return { rpc, tables, upload, storage: { from: () => ({ upload, download: async () => ({ data: null }) }) }, from(name: string) {
    tables.push(name); const q = { select() { return q; }, eq() { return q; }, maybeSingle: async () => ({ data: name === "venues" ? { id: "v" } : name === "sales_scan_extractions" ? { source_sha256: options.scanHash, original_values: { cash: null } } : options.previous ? { id: "prior", venue_id: "v" } : null, error: null }) }; return q;
  } };
}
describe("non-posting receipt intake", () => {
  it("persists source and unknown extraction without financial writes", async () => {
    const d = db(); expect(await receiptIntake(d, "u", input)).toMatchObject({ status: "flagged" });
    expect(d.tables).not.toContain("sales_records");
    expect(d.rpc.mock.calls.map(c => c[0])).not.toContain("rebuild_journal_from_operations");
    expect(d.upload).toHaveBeenCalledOnce();
  });
  it("rejects another tenant before any upload", async () => { const d = db(); await expect(receiptIntake(d, "u", { ...input, tenantId: scanId })).rejects.toThrow("scope denied"); expect(d.upload).not.toHaveBeenCalled(); });
  it("rejects unauthorised uploader", async () => { const d = db({ denied: true }); await expect(receiptIntake(d, "u", input)).rejects.toThrow("not authorised"); expect(d.upload).not.toHaveBeenCalled(); });
  it("rejects mismatched source extraction", async () => { const d = db({ scanHash: "bad" }); await expect(receiptIntake(d, "u", { ...input, scanId })).rejects.toThrow("source mismatch"); expect(d.upload).not.toHaveBeenCalled(); });
  it("preserves matching source link", async () => { const d = db({ scanHash: await sha256(new TextEncoder().encode("receipt")) }); await receiptIntake(d, "u", { ...input, scanId }); expect(d.rpc.mock.calls.at(-1)?.[0]).toBe("register_sales_receipt_intake"); });
  it("same file returns intake without second upload", async () => { const d = db({ previous: true }); expect(await receiptIntake(d, "u", input)).toEqual({ status: "flagged", intakeId: "prior", repeated: true }); expect(d.upload).not.toHaveBeenCalled(); });
  it("upload failure cannot register success", async () => { const d = db({ uploadFails: true }); await expect(receiptIntake(d, "u", input)).rejects.toThrow("Source upload failed"); expect(d.rpc.mock.calls.map(c => c[0])).not.toContain("register_sales_receipt_intake"); });
  it("database failure propagates without financial write", async () => { const d = db({ registerFails: true }); await expect(receiptIntake(d, "u", input)).rejects.toThrow("register failed"); expect(d.tables).not.toContain("sales_records"); });
});