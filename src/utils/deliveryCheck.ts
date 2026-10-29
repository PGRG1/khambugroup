import { supabase } from "@/integrations/supabase/client";

export type DeliveryCheckMode = "quick" | "full";

/** Default when the setting is missing: quick door-tap checking. */
export function resolveDeliveryCheckMode(value: unknown): DeliveryCheckMode {
  return value === "full" ? "full" : "quick";
}

export type DeliveryIssue = "short" | "damaged" | "wrong_item";

export interface DeliveryLineInput {
  invoice_line_item_id: string;
  quantity_invoiced: number;
  /** Current received quantity on the GRN (kept for unaffected lines). */
  quantity_received: number;
  unit_price: number;
}

export interface DeliveryIssueInput {
  issue: DeliveryIssue;
  /** How many units are affected (short / damaged / wrong). */
  affectedQty?: number;
}

export interface DeliveryItemUpdate {
  invoice_line_item_id: string;
  quantity_received: number;
  issue: DeliveryIssue | null;
}

/**
 * Map lines to grn_items updates for a problem report. Every issue type asks
 * "how many affected": quantity_received = current received − affected.
 * Unaffected lines keep their current quantity_received (never reset to
 * invoiced, so scanner shortages are kept).
 */
export function deliveryProblemUpdates(
  lines: DeliveryLineInput[],
  issues: Record<string, DeliveryIssueInput>,
): DeliveryItemUpdate[] {
  return lines.map((line) => {
    const hit = issues[line.invoice_line_item_id];
    if (!hit) {
      return { invoice_line_item_id: line.invoice_line_item_id, quantity_received: line.quantity_received, issue: null };
    }
    const affected = Math.max(0, Math.min(Number(hit.affectedQty) || 0, line.quantity_received));
    return {
      invoice_line_item_id: line.invoice_line_item_id,
      quantity_received: line.quantity_received - affected,
      issue: hit.issue,
    };
  });
}

/** Extra held amount: affected qty × unit price, summed over flagged lines. */
export function deliveryHeldDelta(
  lines: DeliveryLineInput[],
  issues: Record<string, DeliveryIssueInput>,
): number {
  const delta = lines.reduce((sum, line) => {
    const hit = issues[line.invoice_line_item_id];
    if (!hit) return sum;
    const affected = Math.max(0, Math.min(Number(hit.affectedQty) || 0, line.quantity_received));
    return sum + affected * (Number(line.unit_price) || 0);
  }, 0);
  return Math.round(delta * 100) / 100;
}

async function findGrnForInvoice(invoiceId: string, tenantId: string) {
  const { data } = await supabase
    .from("goods_received_notes" as any)
    .select("id, grn_number")
    .eq("invoice_id", invoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (data as any) ?? null;
}

async function applyItemUpdates(grnId: string, tenantId: string, updates: DeliveryItemUpdate[]) {
  for (const u of updates) {
    const { data: existing } = await supabase
      .from("grn_items" as any)
      .select("id")
      .eq("grn_id", grnId)
      .eq("invoice_line_item_id", u.invoice_line_item_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("grn_items" as any)
        .update({ quantity_received: u.quantity_received, issue: u.issue } as any)
        .eq("id", (existing as any).id);
      if (error) return error.message;
    } else {
      const { data: line } = await supabase
        .from("invoice_line_items")
        .select("description, unit, quantity, unit_price, product_master_id")
        .eq("id", u.invoice_line_item_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const { error } = await supabase.from("grn_items" as any).insert({
        grn_id: grnId,
        invoice_line_item_id: u.invoice_line_item_id,
        product_master_id: (line as any)?.product_master_id ?? null,
        description: (line as any)?.description || "(no description)",
        quantity_invoiced: Number((line as any)?.quantity) || 0,
        quantity_received: u.quantity_received,
        unit: (line as any)?.unit || "each",
        unit_cost: Number((line as any)?.unit_price) || 0,
        issue: u.issue,
        tenant_id: tenantId,
      } as any);
      if (error) return error.message;
    }
  }
  return undefined;
}

/**
 * "Report a problem": mark the GRN disputed, record per-line issues, set the
 * invoice to Disputed and add affected qty × unit price to held_amount.
 * received_date is the invoice date (a Hong Kong calendar date string).
 */
export async function reportDeliveryProblem(
  invoiceId: string,
  lines: DeliveryLineInput[],
  issues: Record<string, DeliveryIssueInput>,
  opts: { tenantId: string; userId: string; invoiceDate: string },
): Promise<{ grnNumber?: string; error?: string }> {
  const { tenantId, userId, invoiceDate } = opts;
  const grn = await findGrnForInvoice(invoiceId, tenantId);
  if (!grn) return { error: "No goods received note exists for this invoice yet." };

  const { error: upErr } = await supabase
    .from("goods_received_notes" as any)
    .update({ status: "disputed", received_date: invoiceDate, received_by: userId } as any)
    .eq("id", grn.id)
    .eq("tenant_id", tenantId);
  if (upErr) return { error: upErr.message };

  const itemErr = await applyItemUpdates(grn.id, tenantId, deliveryProblemUpdates(lines, issues));
  if (itemErr) return { error: itemErr };

  const heldDelta = deliveryHeldDelta(lines, issues);
  const { data: inv } = await supabase
    .from("invoices")
    .select("held_amount")
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const { error: invErr } = await supabase
    .from("invoices")
    .update({
      review_status: "Disputed",
      has_disputes: true,
      held_amount: Math.round(((Number((inv as any)?.held_amount) || 0) + heldDelta) * 100) / 100,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", invoiceId)
    .eq("tenant_id", tenantId);
  if (invErr) return { error: invErr.message };

  return { grnNumber: grn.grn_number };
}
