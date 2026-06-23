import { supabase } from "@/integrations/supabase/client";

/**
 * Auto-create a Goods Received Note (and its line items) for a confirmed invoice.
 *
 * Idempotent: if a GRN already exists for the invoice, returns { skipped: true }.
 * Never throws — callers can fire-and-forget. Errors are returned in the result
 * so the invoice confirmation itself is never blocked.
 */
export interface AutoGrnResult {
  skipped?: boolean;
  grn?: { id: string; grn_number: string };
  disputed?: boolean;
  error?: string;
}

export async function autoCreateGrnFromInvoice(
  invoiceId: string,
  opts: { tenantId: string; userId: string }
): Promise<AutoGrnResult> {
  const { tenantId, userId } = opts;
  try {
    if (!invoiceId || !tenantId || !userId) {
      return { error: "Missing invoiceId, tenantId, or userId" };
    }

    // 1. Idempotency
    const { data: existing } = await supabase
      .from("goods_received_notes" as any)
      .select("id, grn_number")
      .eq("invoice_id", invoiceId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (existing) {
      return { skipped: true, grn: existing as any };
    }

    // 2. Load invoice + lines
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, supplier_id, venue")
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId)
      .single();
    if (invErr || !invoice) {
      return { error: invErr?.message || "Invoice not found" };
    }

    const { data: lines, error: linesErr } = await supabase
      .from("invoice_line_items")
      .select(
        "id, description, unit, quantity, unit_price, normalized_unit_cost, total, discount, " +
        "product_master_id, accepted_qty, qty_difference, receiving_reason, receiving_note, " +
        "net_unit_cost, line_discount_amount, header_discount_share"
      )
      .eq("invoice_id", invoiceId)
      .eq("tenant_id", tenantId);
    if (linesErr) return { error: linesErr.message };

    // Fetch product_master classification to know which lines create stock movement
    const productIds = Array.from(new Set(
      (lines || []).map((l: any) => l.product_master_id).filter(Boolean)
    ));
    const productMap = new Map<string, { creates_stock_movement: boolean; financial_treatment: string }>();
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from("product_master")
        .select("id, creates_stock_movement, financial_treatment")
        .in("id", productIds)
        .eq("tenant_id", tenantId);
      for (const p of (products || []) as any[]) {
        productMap.set(p.id, {
          creates_stock_movement: p.creates_stock_movement ?? true,
          financial_treatment: p.financial_treatment ?? "",
        });
      }
    }

    // 3. Create GRN header
    const today = new Date().toISOString().slice(0, 10);
    const { data: grn, error: grnErr } = await supabase
      .from("goods_received_notes" as any)
      .insert({
        invoice_id: invoiceId,
        supplier_id: (invoice as any).supplier_id,
        venue: (invoice as any).venue,
        
        status: "confirmed",
        received_date: today,
        received_by: userId,
        notes: "",
        tenant_id: tenantId,
      } as any)
      .select("id, grn_number")
      .single();
    if (grnErr || !grn) return { error: grnErr?.message || "Failed to create GRN" };

    const grnId = (grn as any).id;

    // 4. Insert grn_items
    let disputed = false;
    if (lines && lines.length > 0) {
      const payload = lines.map((l: any) => {
        const qtyInv = Number(l.quantity) || 0;
        const qtyAcc = l.accepted_qty != null ? Number(l.accepted_qty) : qtyInv;
        const diff = l.qty_difference != null ? Number(l.qty_difference) : qtyAcc - qtyInv;
        if (diff !== 0) disputed = true;
        // Prefer post-discount net_unit_cost (set by scanner/edit view).
        // Fallback chain for legacy rows: unit_price → normalized_unit_cost → (total+discount)/qty
        let unitCost = 0;
        const nucNet = Number(l.net_unit_cost) || 0;
        if (nucNet > 0) {
          unitCost = nucNet;
        } else {
          unitCost = Number(l.unit_price) || 0;
          if (unitCost === 0) {
            const nuc = Number(l.normalized_unit_cost) || 0;
            if (nuc > 0) unitCost = nuc;
          }
          if (unitCost === 0) {
            const lineTotal = Number(l.total) || 0;
            const lineDisc = Number(l.discount) || 0;
            if (lineTotal > 0 && qtyInv > 0) unitCost = (lineTotal + lineDisc) / qtyInv;
          }
        }
        return {
          grn_id: grnId,
          invoice_line_item_id: l.id,
          product_master_id: l.product_master_id ?? null,
          description: l.description || "(no description)",
          quantity_invoiced: qtyInv,
          quantity_received: qtyAcc,
          unit: l.unit || "each",
          unit_cost: unitCost,
          accepted_qty: qtyAcc,
          qty_difference: diff,
          receiving_reason: l.receiving_reason ?? null,
          receiving_note: l.receiving_note ?? null,
          tenant_id: tenantId,
        };
      });
      const { error: itemsErr } = await supabase.from("grn_items" as any).insert(payload as any);
      if (itemsErr) {
        // Best-effort rollback of the GRN header
        await supabase.from("goods_received_notes" as any).delete().eq("id", grnId);
        return { error: itemsErr.message };
      }
    }

    // 5. Flip status if disputed
    if (disputed) {
      await supabase
        .from("goods_received_notes" as any)
        .update({ status: "disputed" } as any)
        .eq("id", grnId);
    }

    // 6. Link invoice → GRN
    await supabase
      .from("invoices")
      .update({ grn_id: grnId } as any)
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId);

    return { grn: grn as any, disputed };
  } catch (e: any) {
    return { error: e?.message || String(e) };
  }
}
