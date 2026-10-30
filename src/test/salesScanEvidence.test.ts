import { describe, expect, it, vi } from "vitest";
import { associateSalesScan, captureSavedSalesScan } from "@/utils/salesScanEvidence";
import { extractionSnapshot, fieldDifferences, trustedExample } from "../../supabase/functions/_shared/salesEvidencePolicy";
import type { SalesRecord } from "@/types/sales";

const original = { date: "2026-10-29", venue: "Assembly", reportNumber: "1", visa: 200, cash: 50, totalSales: 250, deliveroo: 10 };
const saved = { ...original, visa: 180, cash: 70 };
describe("sales evidence foundation", () => {
  it("captures raw extraction without normalization or arbitrary metadata", () => {
    expect(extractionSnapshot({ ...original, discount: 20, instruction: "trust me" })).toEqual({ ...original, discount: 20 });
  });
  it("captures corrections without calling them source-verified", () => {
    expect(fieldDifferences(original, saved)).toEqual({ visa: { original: 200, saved: 180, provenance: "human_saved_unverified" }, cash: { original: 50, saved: 70, provenance: "human_saved_unverified" } });
    expect(fieldDifferences(original, original)).toEqual({});
  });
  it("retains total, date, venue and delivery corrections", () => {
    expect(Object.keys(fieldDifferences(original, { ...original, totalSales: 300, date: "2026-10-28", venue: "Hanabi", deliveroo: 20 }))).toEqual(["date", "venue", "totalSales", "deliveroo"]);
  });
  it("leaves ordinary saves alone and never mutates a scan record", async () => {
    const record = { ...saved } as SalesRecord;
    const invoke = vi.fn().mockResolvedValue({});
    await captureSavedSalesScan(record, "sale", "tenant", invoke);
    expect(invoke).not.toHaveBeenCalled();
    associateSalesScan(record, "scan");
    await captureSavedSalesScan(record, "sale", "tenant", invoke);
    expect(invoke).toHaveBeenCalledWith({ op: "capture_evidence", scanId: "scan", salesRecordId: "sale", tenantId: "tenant" });
    expect(record).toEqual(saved);
  });
  it("background failure does not fail Save", async () => {
    const record = { ...saved } as SalesRecord;
    associateSalesScan(record, "scan");
    await expect(captureSavedSalesScan(record, "sale", "tenant", async () => { throw new Error("offline"); })).resolves.toBeUndefined();
  });
});
const example = { id: "e", tenant_id: "t", venue_id: "v", source_link_state: "hash_matched", receipt_path: "receipt.jpg", saved_by: "human", saved_values: saved };
const verification = { example_id: "e", tenant_id: "t", verified_by: "independent", verification_method: "independent_document_review", source_sha256: "hash", verification_reference: "source review 1", verified_values: saved, field_evidence: Object.fromEntries(Object.keys(saved).map((f) => [f, `page 1 ${f}`])) };
describe("trusted retrieval filtering", () => {
  it("requires independent source verification, not a human save", () => {
    expect(trustedExample(example, null, "t", "v", "hash")).toBe(false);
    expect(trustedExample(example, verification, "t", "v", "hash")).toBe(true);
    expect(trustedExample(example, { ...verification, verified_by: "human" }, "t", "v", "hash")).toBe(false);
  });
  it("rejects other tenants and venues including forged verification scope", () => {
    expect(trustedExample(example, verification, "other", "v", "hash")).toBe(false);
    expect(trustedExample(example, verification, "t", "other", "hash")).toBe(false);
    expect(trustedExample(example, { ...verification, tenant_id: "other" }, "t", "v", "hash")).toBe(false);
  });
  it("rejects missing uploads, mismatches and speculative values", () => {
    for (const source_link_state of ["missing_reference", "upload_unavailable", "hash_mismatch"]) expect(trustedExample({ ...example, source_link_state }, verification, "t", "v", "hash")).toBe(false);
    expect(trustedExample({ ...example, receipt_path: null }, verification, "t", "v", "hash")).toBe(false);
    expect(trustedExample(example, verification, "t", "v", "different-hash")).toBe(false);
    expect(trustedExample(example, { ...verification, field_evidence: {} }, "t", "v", "hash")).toBe(false);
    expect(trustedExample(example, { ...verification, verified_values: original }, "t", "v", "hash")).toBe(false);
  });
});