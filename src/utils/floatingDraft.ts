export * from "../../supabase/functions/_shared/floatingDraft";
import { expectedLineTotal, pruneStaleLineMathFlags } from "@/utils/invoiceLineMath";
import { formatLineTotal, type RoundingMode } from "@/utils/invoiceRounding";
import type { DraftProposal } from "../../supabase/functions/_shared/floatingDraft";
export function correctDraftLine<T extends Record<string, unknown>>(line: T, p: DraftProposal, mode: RoundingMode): T {
  const next: Record<string, unknown> = { ...line, [p.field]: p.value };
  if (p.field === "quantity" && !line.accepted_qty_touched) next.accepted_qty = p.value;
  if (p.field === "accepted_qty") next.accepted_qty_touched = true;
  if (["quantity", "accepted_qty"].includes(p.field)) {
    if (Number(next.quantity) === Number(next.accepted_qty ?? next.quantity)) next.receiving_reason = "matched";
    else if (!next.receiving_reason || next.receiving_reason === "matched") next.receiving_reason = "";
  }
  if (["quantity", "unit_price"].includes(p.field)) {
    next.total = formatLineTotal(expectedLineTotal(next), mode);
    next.total_override = false;
    next.is_free_unit_line = Number(next.unit_price) === 0 && Number(next.quantity) > 0;
  }
  if (["unit_price", "accepted_price"].includes(p.field)) {
    next.price_disputed = next.accepted_price !== "" && next.accepted_price != null && Math.round(Number(next.accepted_price) * 100) !== Math.round(Number(next.unit_price) * 100);
    next.price_changed = Number(next.master_price) > 0 && Math.abs(Number(next.unit_price) - Number(next.master_price)) > 0.005;
  }
  return pruneStaleLineMathFlags(next, { actualTotal: next.printed_amount }) as T;
}