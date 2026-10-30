export const SALES_EVIDENCE_FIELDS = ["date", "venue", "reportNumber", "orders", "guests", "subtotal", "serviceCharge", "discount", "totalSales", "visa", "mastercard", "amex", "unionPay", "jcb", "alipay", "wechat", "payme", "cash", "deliveroo", "foodpanda", "keeta", "cardTips"] as const;
export function extractionSnapshot(raw: Record<string, unknown>) {
  return Object.fromEntries(SALES_EVIDENCE_FIELDS.filter((field) => Object.hasOwn(raw, field)).map((field) => [field, raw[field]]));
}
export function fieldDifferences(original: Record<string, unknown>, saved: Record<string, unknown>) {
  return Object.fromEntries(SALES_EVIDENCE_FIELDS.filter((f) => JSON.stringify(original[f]) !== JSON.stringify(saved[f]))
    .map((f) => [f, { original: original[f] ?? null, saved: saved[f] ?? null, provenance: "human_saved_unverified" }]));
}
export function trustedExample(example: any, verification: any, tenantId: string, venueId: string, sourceHash: string) {
  if (example.tenant_id !== tenantId || example.venue_id !== venueId || example.source_link_state !== "hash_matched" || !example.receipt_path) return false;
  if (!verification || verification.example_id !== example.id || verification.tenant_id !== tenantId || verification.verified_by === example.saved_by || verification.source_sha256 !== sourceHash) return false;
  if (!["independent_document_review", "independent_source_reconciliation"].includes(verification.verification_method) || !verification.verification_reference?.trim()) return false;
  const fields = Object.keys(example.saved_values);
  return fields.length > 0 && fields.every((f) => JSON.stringify(verification.verified_values?.[f]) === JSON.stringify(example.saved_values[f]) && typeof verification.field_evidence?.[f] === "string" && verification.field_evidence[f].trim().length > 0);
}