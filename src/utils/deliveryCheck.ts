import { supabase } from "@/integrations/supabase/client";
import { autoCreateGrnFromInvoice } from "@/utils/autoCreateGrnFromInvoice";
import { hongKongDate } from "@/utils/purchasingOverview";

export type DeliveryCheckMode = "quick" | "full";

/** Default when the setting is missing: quick door-tap checking. */
export function resolveDeliveryCheckMode(value: unknown): DeliveryCheckMode {
  return value === "full" ? "full" : "quick";
}

/**
 * Nav rule: Purchase Orders stay visible in Full mode; in Quick mode they only
 * appear once at least one supplier is flagged as needing a PO.
 */
export function showPurchaseOrdersInNav(mode: DeliveryCheckMode, anySupplierNeedsPo: boolean): boolean {
  return mode === "full" || anySupplierNeedsPo;
}

/** The door tap only applies in Quick mode for suppliers that don't need a PO. */
export function shouldOfferDoorTap(mode: DeliveryCheckMode, supplierNeedsPo: boolean): boolean {
  return mode === "quick" && !supplierNeedsPo;
}

/**
 * No-duplicate rule: reuse the GRN that already exists for the invoice
 * (auto-creation or a manual one); only create when there is none.
 */
export function planDeliveryGrn(existingGrnId: string | null): { create: boolean } {
  return { create: !existingGrnId };
}

export type DeliveryIssue = "short" | "damaged" | "wrong_item";

export interface DeliveryLineInput {
  invoice_line_item_id: string;
  quantity_invoiced: number;
}

export interface DeliveryIssueInput {
  issue: DeliveryIssue;
  /** Arrived quantity — only meaningful for "short". */
  receivedQty?: number;
}

export interface DeliveryItemUpdate {
  invoice_line_item_id: string;
  quantity_received: number;
  issue: DeliveryIssue | null;
}

/**
 * Map invoice lines to grn_items updates. Unaffected lines keep the invoiced
 * quantity; "short" uses the arrived quantity, damaged/wrong keep the invoiced
 * quantity (the goods arrived, they're just not usable).
 */
export function deliveryGrnItemUpdates(
  lines: DeliveryLineInput[],
  issues: Record<string, DeliveryIssueInput>,
): DeliveryItemUpdate[] {
  return lines.map((line) => {
    const hit = issues[line.invoice_line_item_id];
    if (!hit) {
      return { invoice_line_item_id: line.invoice_line_item_id, quantity_received: line.quantity_invoiced, issue: null };
    }
    const received = hit.issue === "short" && hit.receivedQty != null
      ? Math.max(0, Math.min(Number(hit.receivedQty) || 0, line.quantity_invoiced))
      : line.quantity_invoiced;
    return { invoice_line_item_id: line.invoice_line_item_id, quantity_received: received, issue: hit.issue };
  });
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

/** Reuse the existing GRN or let idempotent auto-creation make one. */
async function ensureGrnForInvoice(invoiceId: string, tenantId: string, userId: string) {
  const existing = await findGrnForInvoice(invoiceId, tenantId);
  if (!planDeliveryGrn(existing?.id ?? null).create) return { grn: existing, error: undefined as string | undefined };
  const res = await autoCreateGrnFromInvoice(invoiceId, { tenantId, userId });
  if (res.error) return { grn: null, error: res.error };
  const grn = res.grn ?? (await findGrnForInvoice(invoiceId, tenantId));
  return { grn, error: grn ? undefined : "Could not create the goods received note" };
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

/** "All good": exactly one GRN for the invoice, confirmed, received today (HK). */
export async function confirmDeliveryGrn(
  invoiceId: string,
  opts: { tenantId: string; userId: string },
): Promise<{ grnNumber?: string; error?: string }> {
  const { tenantId, userId } = opts;
  const { grn, error } = await ensureGrnForInvoice(invoiceId, tenantId, userId);
  if (!grn) return { error };
  const today = hongKongDate();
  const { error: upErr } = await supabase
    .from("goods_received_notes" as any)
    .update({ status: "confirmed", received_date: today, received_by: userId } as any)
    .eq("id", grn.id)
    .eq("tenant_id", tenantId);
  if (upErr) return { error: upErr.message };

  const { data: items } = await supabase
    .from("grn_items" as any)
    .select("id, quantity_invoiced")
    .eq("grn_id", grnId(grn))
    .eq("tenant_id", tenantId);
  for (const item of (items as any[]) ?? []) {
    await supabase
      .from("grn_items" as any)
      .update({ quantity_received: Number(item.quantity_invoiced) || 0, issue: null } as any)
      .eq("id", item.id);
  }
  return { grnNumber: grn.grn_number };
}

function grnId(grn: any): string {
  return grn.id;
}

/** "Problem": mark the GRN disputed and record per-line issues. */
export async function disputeDeliveryGrn(
  invoiceId: string,
  lines: DeliveryLineInput[],
  issues: Record<string, DeliveryIssueInput>,
  opts: { tenantId: string; userId: string },
): Promise<{ grnNumber?: string; error?: string }> {
  const { tenantId, userId } = opts;
  const { grn, error } = await ensureGrnForInvoice(invoiceId, tenantId, userId);
  if (!grn) return { error };
  const today = hongKongDate();
  const { error: upErr } = await supabase
    .from("goods_received_notes" as any)
    .update({ status: "disputed", received_date: today, received_by: userId } as any)
    .eq("id", grn.id)
    .eq("tenant_id", tenantId);
  if (upErr) return { error: upErr.message };
  const itemErr = await applyItemUpdates(grn.id, tenantId, deliveryGrnItemUpdates(lines, issues));
  if (itemErr) return { error: itemErr };
  return { grnNumber: grn.grn_number };
}
