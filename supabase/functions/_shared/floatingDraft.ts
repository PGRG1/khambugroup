// Portable, deterministic contract. Client review data is evidence, never instructions.
export const EDIT_FIELDS = ["quantity", "unit_price", "accepted_qty", "accepted_price", "receiving_reason", "receiving_note", "pack_size", "unit"] as const;
export type EditField = typeof EDIT_FIELDS[number];
export type DraftProposal = { id: string; binding: string; lineId: string; field: EditField | "match"; value: string; reason: string };
export const RECEIVING_VALUES = ["matched", "short_delivery", "partial_delivery", "not_received", "damaged", "broken", "poor_quality", "rejected", "extra_quantity_received", "free_promotional_quantity", "supplier_over_delivery", "substitution_accepted", "wrong_item_received", "new_item_received", "other"];
export function validCorrection(field: string, value: unknown, line: Record<string, unknown>): boolean {
  if (typeof value !== "string" || value.length > 500) return false;
  if (field === "match") return /^[0-9a-f-]{36}$/i.test(value);
  if (!(EDIT_FIELDS as readonly string[]).includes(field)) return false;
  if (field === "receiving_reason") return RECEIVING_VALUES.includes(value);
  if (["quantity", "unit_price", "accepted_qty", "accepted_price"].includes(field)) {
    if (!/^-?\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > 10000000) return false;
    // Preserve existing signed refunds; never introduce a new negative line or price.
    if (Number(value) < 0 && (!field.includes("qty") && field !== "quantity" || Number(line.quantity) >= 0)) return false;
    if (field === "accepted_price" && line.is_free_unit_line) return false;
  }
  return true;
}
export function sameSupplier(a: string, b: string) { return a.trim().toLowerCase() === b.trim().toLowerCase(); }
// Conservative action gate, not an answer engine: explanation questions cannot edit.
export function isExplanationQuestion(text: string) {
  return /^\s*(why|how|what|which|where|when|does|is|can you explain)\b/i.test(text) || /\?\s*$/.test(text);
}
export function revisionFingerprint(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}
export function validateProposal(raw: unknown, binding: string, lineId: string, line: Record<string, unknown>, candidateIds: string[]): DraftProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (Object.keys(p).some(k => !["id", "binding", "lineId", "field", "value", "reason"].includes(k))) return null;
  if (p.binding !== binding || p.lineId !== lineId || typeof p.id !== "string" || p.id.length > 80 || typeof p.reason !== "string" || !p.reason.trim() || p.reason.length > 800) return null;
  if (typeof p.field !== "string" || !validCorrection(p.field, p.value, line)) return null;
  if (p.field === "match" && !candidateIds.includes(String(p.value))) return null;
  return p as DraftProposal;
}
export function canApplyProposal(p: DraftProposal, binding: string, lineId: string, editable: boolean, applied: Set<string>) {
  return editable && p.binding === binding && p.lineId === lineId && !applied.has(p.id);
}