import { describe, expect, it, vi } from "vitest";
import { captureExtraction, captureSavedExample, retrieveSalesEvidence, sha256 } from "../../supabase/functions/_shared/salesEvidence";

function database(rows: Record<string, any[]>, rpc: (name: string, args: any) => any, download = async () => ({ data: null, error: "missing" })) {
  const queries: any[] = [];
  return {
    queries, storage: { from: () => ({ download }) }, rpc: vi.fn(async (name, args) => rpc(name, args)),
    from(table: string) {
      const filters: [string, any][] = []; let inserted: any;
      const query: any = {
        select() { return query; }, eq(k: string, v: any) { filters.push([k, v]); return query; },
        order() { return query; }, limit() { return query; }, insert(v: any) { inserted = v; return query; },
        async then(resolve: any) { queries.push({ table, filters, inserted }); return resolve({ data: (rows[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v)), error: null }); },
        async maybeSingle() { queries.push({ table, filters }); return { data: (rows[table] ?? []).find((r) => filters.every(([k, v]) => r[k] === v)) ?? null }; },
        async single() { queries.push({ table, filters, inserted }); return { data: { id: "scan" }, error: null }; },
      };
      return query;
    },
  };
}
const scope = (name: string) => ({ data: ["user_has_tenant", "user_has_venue"].includes(name) });
describe("server capture", () => {
  it("persists server-original values and source hash without file bytes", async () => {
    const db = database({}, scope);
    expect(await captureExtraction(db, "t", "u", { visa: 20, discount: 5 }, btoa("source"), "image/png")).toBe("scan");
    expect(db.queries[0].inserted).toMatchObject({ original_values: { visa: 20, discount: 5 }, scanned_by: "u", tenant_id: "t", source_mime_type: "image/png", report_structure: null });
    expect(db.queries[0].inserted.source_sha256).toHaveLength(64);
    expect(JSON.stringify(db.queries)).not.toContain(btoa("source"));
  });
  it("captures absent upload references as unverified, deriving the save from its ID", async () => {
    const db = database({ sales_scan_extractions: [{ id: "s", tenant_id: "t", scanned_by: "u", source_sha256: "hash" }], sales_records: [{ id: "r", tenant_id: "t", venue_id: "v", receipt_file_url: null }], venues: [{ id: "v", tenant_id: "t" }] }, (name, args) => name === "capture_sales_scan_example" ? { data: args.p_source_link_state } : scope(name));
    expect(await captureSavedExample(db, "u", "t", "s", "r")).toBe("missing_reference");
    expect(db.rpc).toHaveBeenCalledWith("capture_sales_scan_example", { p_scan_id: "s", p_sales_record_id: "r", p_tenant_id: "t", p_user_id: "u", p_source_link_state: "missing_reference" });
  });
  it("returns an existing event without reapplying corrections or downloading", async () => {
    const download = vi.fn();
    const db = database({ sales_scan_extractions: [{ id: "s", tenant_id: "t", scanned_by: "u" }], sales_records: [{ id: "r", tenant_id: "t", venue_id: "v" }], venues: [{ id: "v", tenant_id: "t" }], sales_scan_examples: [{ id: "e", tenant_id: "t", scan_id: "s", sales_record_id: "r" }] }, scope, download);
    expect(await captureSavedExample(db, "u", "t", "s", "r")).toBe("e");
    expect(download).not.toHaveBeenCalled();
    expect(db.rpc.mock.calls.map(([name]) => name)).not.toContain("capture_sales_scan_example");
  });
  it("denies cross-tenant record and extraction linkage", async () => {
    const db = database({ sales_scan_extractions: [{ id: "s", tenant_id: "other", scanned_by: "u" }] }, scope);
    await expect(captureSavedExample(db, "u", "t", "s", "r")).rejects.toThrow("scope denied");
  });
});
describe("server retrieval", () => {
  it("returns no audit-only examples and rejects denied venue access", async () => {
    const db = database({ venues: [{ id: "v", tenant_id: "t" }] }, scope);
    expect(await retrieveSalesEvidence(db, "u", "t", "v")).toEqual([]);
    expect(db.queries.find((q) => q.table === "sales_scan_examples")?.filters).toEqual([["tenant_id", "t"], ["venue_id", "v"], ["source_link_state", "hash_matched"]]);
    await expect(retrieveSalesEvidence(database({}, scope), "u", "t", "v")).rejects.toThrow("scope denied");
  });
  it("prefers matching structure, caps at three and requires live original evidence", async () => {
    const bytes = new TextEncoder().encode("receipt"); const hash = await sha256(bytes);
    const examples = ["other", "matching", "matching", "matching", "matching"].map((structure, i) => ({
      id: `e${i}`, tenant_id: "t", venue_id: "v", source_link_state: "hash_matched", receipt_path: `r${i}`, saved_by: "u", saved_values: { visa: 20 },
      sales_scan_extractions: { source_sha256: hash, report_structure: structure },
      sales_scan_verifications: [{ example_id: `e${i}`, tenant_id: "t", verified_by: "reviewer", source_sha256: hash, verification_method: "independent_document_review", verification_reference: "review", verified_values: { visa: 20 }, field_evidence: { visa: "page 1 tender row" } }],
    }));
    const download = async (path: string) => path === "r1" ? { data: null, error: "missing" } : { data: new Blob([bytes]), error: null };
    const db = database({ venues: [{ id: "v", tenant_id: "t" }], sales_scan_examples: examples }, scope, download as any);
    const result = await retrieveSalesEvidence(db, "u", "t", "v", "matching");
    expect(result.map((e) => e.id)).toEqual(["e2", "e3", "e4"]);
    expect(result[0]).toMatchObject({ trustState: "independently_verified", usage: "contextual_example_not_substitution_rule", document: { path: "r2", sha256: hash } });
  });
});