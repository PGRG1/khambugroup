import { extractionSnapshot, trustedExample } from "./salesEvidencePolicy.ts";

export async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function captureExtraction(admin: any, tenantId: string, userId: string, raw: Record<string, unknown>, base64: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const { data, error } = await admin.from("sales_scan_extractions").insert({
    tenant_id: tenantId, scanned_by: userId, original_values: extractionSnapshot(raw), source_sha256: await sha256(bytes),
    source_mime_type: mime, extractor_model: "google/gemini-2.5-flash", extractor_version: "parse-receipt-v1",
    // No reliable POS/layout descriptor is currently extracted; never invent one.
    report_structure: null,
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}
async function allowedVenue(admin: any, userId: string, tenantId: string, venueId: string) {
  const { data: venue } = await admin.from("venues").select("id").eq("id", venueId).eq("tenant_id", tenantId).maybeSingle();
  const { data: tenantAllowed } = await admin.rpc("user_has_tenant", { _user_id: userId, _tenant_id: tenantId });
  const { data: venueAllowed } = await admin.rpc("user_has_venue", { _user_id: userId, _venue_id: venueId });
  return !!venue && tenantAllowed === true && venueAllowed === true;
}
async function linkedHash(admin: any, path: string | null) {
  if (!path) return null;
  const { data, error } = await admin.storage.from("sales-receipts").download(path);
  if (error || !data || data.size > 10 * 1024 * 1024) return null;
  return sha256(new Uint8Array(await data.arrayBuffer()));
}
export async function captureSavedExample(admin: any, userId: string, tenantId: string, scanId: string, salesRecordId: string) {
  const { data: scan } = await admin.from("sales_scan_extractions").select("id,source_sha256").eq("id", scanId).eq("tenant_id", tenantId).eq("scanned_by", userId).maybeSingle();
  const { data: sale } = await admin.from("sales_records").select("id,venue_id,receipt_file_url").eq("id", salesRecordId).eq("tenant_id", tenantId).maybeSingle();
  if (!scan || !sale?.venue_id || !await allowedVenue(admin, userId, tenantId, sale.venue_id)) throw new Error("Evidence scope denied");
  const { data: existing } = await admin.from("sales_scan_examples").select("id").eq("scan_id", scanId).eq("sales_record_id", salesRecordId).eq("tenant_id", tenantId).maybeSingle();
  if (existing) return existing.id;
  let hash: string | null = null;
  try { hash = await linkedHash(admin, sale.receipt_file_url); } catch { /* Retain an unverified audit without a working upload. */ }
  const state = !sale.receipt_file_url ? "missing_reference" : !hash ? "upload_unavailable" : hash === scan.source_sha256 ? "hash_matched" : "hash_mismatch";
  const { data, error } = await admin.rpc("capture_sales_scan_example", { p_scan_id: scanId, p_sales_record_id: salesRecordId, p_tenant_id: tenantId, p_user_id: userId, p_source_link_state: state });
  if (error) throw error;
  return data;
}
/** Explicit future opt-in only. Never injected into existing prompts in Step 1. */
export async function retrieveSalesEvidence(admin: any, userId: string, tenantId: string, venueId: string, reportStructure?: string) {
  if (!await allowedVenue(admin, userId, tenantId, venueId)) throw new Error("Evidence scope denied");
  const { data, error } = await admin.from("sales_scan_examples")
    .select("*,sales_scan_extractions!inner(source_sha256,extractor_model,extractor_version,extracted_at,report_structure),sales_scan_verifications!inner(*)")
    .eq("tenant_id", tenantId).eq("venue_id", venueId).eq("source_link_state", "hash_matched")
    .order("captured_at", { ascending: false }).limit(20);
  if (error) throw error;
  const candidates = (data ?? []).filter((e: any) => e.sales_scan_verifications.some((v: any) => trustedExample(e, v, tenantId, venueId, e.sales_scan_extractions.source_sha256)));
  candidates.sort((a: any, b: any) => Number(!!reportStructure && b.sales_scan_extractions.report_structure === reportStructure) - Number(!!reportStructure && a.sales_scan_extractions.report_structure === reportStructure));
  const result = [];
  for (const e of candidates) {
    if (result.length >= 3) break;
    // Broken, removed or replaced original documents are not usable guidance.
    if (await linkedHash(admin, e.receipt_path) !== e.sales_scan_extractions.source_sha256) continue;
    const verification = e.sales_scan_verifications.find((v: any) => trustedExample(e, v, tenantId, venueId, e.sales_scan_extractions.source_sha256));
    result.push({ id: e.id, tenantId, venueId, salesRecordId: e.sales_record_id, document: { bucket: e.receipt_bucket, path: e.receipt_path, sha256: e.sales_scan_extractions.source_sha256 }, originalValues: e.original_values, savedValues: e.saved_values, differences: e.field_differences, extraction: e.sales_scan_extractions, savedBy: e.saved_by, capturedAt: e.captured_at, verification, trustState: "independently_verified", usage: "contextual_example_not_substitution_rule" });
  }
  return result;
}