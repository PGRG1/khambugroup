import { supabase } from "@/integrations/supabase/client";

export interface SupplierDeal {
  id: string;
  product_id: string;
  supplier_id: string;
  buy_qty: number;
  free_qty: number;
  is_active: boolean;
  deal_type: string;
}

/** Fetch all active buy-X-get-Y-free deals for a supplier within tenant. */
export async function fetchActiveDealsForSupplier(
  supplierId: string | null | undefined,
  tenantId: string | null | undefined,
): Promise<SupplierDeal[]> {
  if (!supplierId || !tenantId) return [];
  const { data, error } = await supabase
    .from("item_supplier_deals" as any)
    .select("id, product_id, supplier_id, buy_qty, free_qty, is_active, deal_type")
    .eq("supplier_id", supplierId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .eq("deal_type", "buy_x_get_y_free");
  if (error) return [];
  return (data ?? []) as unknown as SupplierDeal[];
}

export function findDealForProduct(
  deals: SupplierDeal[],
  productId: string | null | undefined,
): SupplierDeal | null {
  if (!productId) return null;
  return deals.find((d) => d.product_id === productId) ?? null;
}

export interface MissingDealWarning {
  deal: SupplierDeal;
  productName: string;
  expectedFree: number;
  receivedFree: number;
  missing: number;
}

interface LineLite {
  product_master_id: string | null;
  quantity: number;
  unit_price: number;
  is_free_unit_line?: boolean;
  matched_internal_name?: string;
  description?: string;
}

/** Compute deals that are not fully claimed on the current invoice. */
export function computeMissingDeals(
  deals: SupplierDeal[],
  lines: LineLite[],
): MissingDealWarning[] {
  const out: MissingDealWarning[] = [];
  for (const deal of deals) {
    if (!deal.buy_qty || !deal.free_qty) continue;
    const paid = lines.filter(
      (l) => l.product_master_id === deal.product_id && l.unit_price > 0 && l.quantity > 0,
    );
    const free = lines.filter(
      (l) => l.product_master_id === deal.product_id && l.is_free_unit_line,
    );
    const paidQty = paid.reduce((s, l) => s + (l.quantity || 0), 0);
    const freeQty = free.reduce((s, l) => s + (l.quantity || 0), 0);
    const expected = Math.floor(paidQty / deal.buy_qty) * deal.free_qty;
    if (expected > 0 && freeQty < expected) {
      const name =
        paid[0]?.matched_internal_name || paid[0]?.description || "Item";
      out.push({
        deal,
        productName: name,
        expectedFree: expected,
        receivedFree: freeQty,
        missing: expected - freeQty,
      });
    }
  }
  return out;
}
