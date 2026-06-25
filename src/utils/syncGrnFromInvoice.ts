import { supabase } from "@/integrations/supabase/client";

/**
 * Authoritative GRN re-sync from current invoice_line_items.
 *
 * Why: useInvoiceData.updateInvoice deletes and re-inserts all invoice_line_items
 * on every save. The FK grn_items.invoice_line_item_id is ON DELETE SET NULL, so
 * existing grn_items get their line link wiped before we can match them. To stay
 * correct regardless of how the invoice was saved, we always rebuild grn_items
 * from the current invoice_line_items rows for this invoice.
 */
export async function syncGrnFromInvoice(
  invoiceId: string,
  opts: { tenantId: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { tenantId } = opts;
    if (!invoiceId || !tenantId) return { ok: false, error: "missing invoiceId or tenantId" };

    // 1. Find the GRN for this invoice
    const { data: grn, error: grnErr } = await supabase
      .from("goods_received_notes" as any)
      .select("id")
      .eq("invoice_id", invoiceId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (grnErr) return { ok: false, error: grnErr.message };
    if (!grn) return { ok: true }; // No GRN exists yet — skip silently

    const grnId = (grn as any).id;

    // 2. Re-fetch the current invoice_line_items (post-save)
    const { data: lines, error: linesErr } = await supabase
      .from("invoice_line_items")
      .select(
        "id, product_master_id, description, quantity, accepted_qty, unit, unit_price, accepted_price, net_unit_cost, receiving_reason, receiving_note, is_free_unit_line"
      )
      .eq("invoice_id", invoiceId)
      .eq("tenant_id", tenantId);
    if (linesErr) return { ok: false, error: linesErr.message };
    const invoiceLines = (lines || []) as any[];

    // 3. Load product classifications for stock-movement filtering
    const productIds = Array.from(
      new Set(invoiceLines.map((l) => l.product_master_id).filter(Boolean))
    ) as string[];
    const productMap = new Map<string, { creates_stock_movement: boolean }>();
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from("product_master")
        .select("id, creates_stock_movement")
        .in("id", productIds)
        .eq("tenant_id", tenantId);
      for (const p of (products || []) as any[]) {
        productMap.set(p.id, { creates_stock_movement: p.creates_stock_movement ?? true });
      }
    }

    // 4. Cost fallback chain — same as autoCreateGrnFromInvoice
    const resolveUnitCost = (line: any): number => {
      const netCost = Number(line.net_unit_cost) || 0;
      if (netCost > 0) return netCost;
      const accPrice = Number(line.accepted_price) || 0;
      if (accPrice > 0) return accPrice;
      return Number(line.unit_price) || 0;
    };

    // 5. Filter to stock-bearing lines
    const stockLines = invoiceLines.filter((l) => {
      const p = l.product_master_id ? productMap.get(l.product_master_id) : null;
      if (!p) return true; // unmapped lines still post stock
      return p.creates_stock_movement !== false;
    });

    // 6. Delete ALL existing grn_items for this GRN (authoritative rebuild)
    const { error: delErr } = await supabase
      .from("grn_items" as any)
      .delete()
      .eq("grn_id", grnId)
      .eq("tenant_id", tenantId);
    if (delErr) return { ok: false, error: delErr.message };

    // 7. Insert fresh grn_items from current invoice lines
    let disputed = false;
    const inserts = stockLines.map((line) => {
      const qtyInv = Number(line.quantity) || 0;
      const qtyAcc = line.accepted_qty != null ? Number(line.accepted_qty) : qtyInv;
      const diff = qtyAcc - qtyInv;
      if (diff !== 0) disputed = true;
      const unitCost = resolveUnitCost(line);
      const accPrice = Number(line.accepted_price) > 0 ? Number(line.accepted_price) : unitCost;
      return {
        grn_id: grnId,
        invoice_line_item_id: line.id,
        product_master_id: line.product_master_id ?? null,
        description: line.description || "(no description)",
        quantity_invoiced: qtyInv,
        quantity_received: qtyAcc,
        accepted_qty: qtyAcc,
        accepted_price: accPrice,
        qty_difference: diff,
        unit: line.unit || "each",
        unit_cost: unitCost,
        receiving_reason: line.receiving_reason ?? null,
        receiving_note: line.receiving_note ?? null,
        tenant_id: tenantId,
      };
    });

    if (inserts.length > 0) {
      const { error: insErr } = await supabase
        .from("grn_items" as any)
        .insert(inserts as any);
      if (insErr) return { ok: false, error: insErr.message };
    }

    // 8. Check non-stock lines for dispute too
    if (!disputed) {
      for (const line of invoiceLines) {
        const qtyInv = Number(line.quantity) || 0;
        const qtyAcc = line.accepted_qty != null ? Number(line.accepted_qty) : qtyInv;
        if (qtyAcc !== qtyInv) {
          disputed = true;
          break;
        }
      }
    }

    // 9. Update GRN status
    await supabase
      .from("goods_received_notes" as any)
      .update({ status: disputed ? "disputed" : "confirmed" } as any)
      .eq("id", grnId)
      .eq("tenant_id", tenantId);

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
