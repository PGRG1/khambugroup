import { supabase } from "@/integrations/supabase/client";

export async function syncGrnFromInvoice(
  invoiceId: string,
  editedLines: {
    id: string;
    product_master_id: string | null;
    description: string;
    quantity: string;
    accepted_qty: string;
    qty_difference?: number;
    unit: string;
    unit_price: string;
    accepted_price: string;
    net_unit_cost?: number;
    receiving_reason?: string | null;
    receiving_note?: string | null;
    is_free_unit_line?: boolean;
  }[],
  opts: { tenantId: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { tenantId } = opts;

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

    // 2. Load product classifications
    const productIds = Array.from(new Set(
      editedLines.map(l => l.product_master_id).filter(Boolean)
    )) as string[];
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

    // 3. Load existing grn_items for this GRN
    const { data: existingItems } = await supabase
      .from("grn_items" as any)
      .select("id, invoice_line_item_id")
      .eq("grn_id", grnId)
      .eq("tenant_id", tenantId);
    const existingMap = new Map<string, string>();
    for (const item of (existingItems || []) as any[]) {
      if (item.invoice_line_item_id) {
        existingMap.set(item.invoice_line_item_id, item.id);
      }
    }

    // 4. Compute unit_cost using same fallback chain as autoCreateGrnFromInvoice
    const resolveUnitCost = (line: typeof editedLines[0]): number => {
      const netCost = Number(line.net_unit_cost) || 0;
      if (netCost > 0) return netCost;
      const accPrice = parseFloat(line.accepted_price) || 0;
      if (accPrice > 0) return accPrice;
      return parseFloat(line.unit_price) || 0;
    };

    // 5. Upsert stock-bearing lines
    let disputed = false;
    const stockLines = editedLines.filter(l => {
      const p = l.product_master_id ? productMap.get(l.product_master_id) : null;
      if (!p) return true;
      return p.creates_stock_movement !== false;
    });

    for (const line of stockLines) {
      const qtyInv = parseFloat(line.quantity) || 0;
      const qtyAcc = parseFloat(line.accepted_qty) || qtyInv;
      const diff = qtyAcc - qtyInv;
      if (diff !== 0) disputed = true;
      const unitCost = resolveUnitCost(line);

      const existingGrnItemId = existingMap.get(line.id);
      if (existingGrnItemId) {
        // Update existing grn_item
        await supabase
          .from("grn_items" as any)
          .update({
            quantity_invoiced: qtyInv,
            quantity_received: qtyAcc,
            accepted_qty: qtyAcc,
            accepted_price: Number(line.accepted_price) > 0 ? Number(line.accepted_price) : resolveUnitCost(line),
            qty_difference: diff,
            unit_cost: unitCost,
            description: line.description,
            unit: line.unit || "each",
            receiving_reason: line.receiving_reason ?? null,
            receiving_note: line.receiving_note ?? null,
          } as any)
          .eq("id", existingGrnItemId)
          .eq("tenant_id", tenantId);
        existingMap.delete(line.id);
      } else {
        // Insert new grn_item (line was added during edit)
        await supabase
          .from("grn_items" as any)
          .insert({
            grn_id: grnId,
            invoice_line_item_id: line.id,
            product_master_id: line.product_master_id ?? null,
            description: line.description || "(no description)",
            quantity_invoiced: qtyInv,
            quantity_received: qtyAcc,
            accepted_qty: qtyAcc,
            accepted_price: Number(line.accepted_price) > 0 ? Number(line.accepted_price) : resolveUnitCost(line),
            qty_difference: diff,
            unit: line.unit || "each",
            unit_cost: unitCost,
            receiving_reason: line.receiving_reason ?? null,
            receiving_note: line.receiving_note ?? null,
            tenant_id: tenantId,
          } as any);
      }
    }

    // 6. Delete grn_items for lines that were removed during edit
    const removedIds = Array.from(existingMap.values());
    if (removedIds.length > 0) {
      await supabase
        .from("grn_items" as any)
        .delete()
        .in("id", removedIds);
    }

    // 7. Check all lines for dispute (including non-stock)
    for (const line of editedLines) {
      const qtyInv = parseFloat(line.quantity) || 0;
      const qtyAcc = parseFloat(line.accepted_qty) || qtyInv;
      if (qtyAcc !== qtyInv) { disputed = true; break; }
    }

    // 8. Update GRN status
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
