/**
 * Deterministic `normalized_unit_cost` for invoice lines.
 *
 * `normalized_unit_cost` is PRICE-COMPARISON metadata only (cost per Stock UOM).
 * It is never accounting coding and must never gate categorisation.
 *
 * It is derived from the matched Items Master conversion — NOT from scanned
 * free-text pack sizes (the invoice extractor deliberately leaves `pack_size`
 * blank):
 *
 *   normalized_unit_cost = net purchase-unit cost / purchase-to-stock qty
 *
 * e.g. HK$480 per Case with stock_qty 24 Bottle => HK$20.00 / Bottle.
 *
 * Purchase UOM and Stock UOM stay independent; only the numeric conversion
 * quantity is used. When the conversion is missing or invalid we return null
 * rather than guessing.
 */

export interface ConversionSource {
  /** Supplier-specific Purchase → Stock quantity (product_suppliers.stock_qty). */
  supplierStockQty?: number | string | null;
  /** Items Master fallback (product_master.stock_qty). */
  productStockQty?: number | string | null;
}

export interface NormalizedCostInput extends ConversionSource {
  /** Invoice line NET purchase-unit cost after discounts. */
  netUnitCost?: number | string | null;
  /** Optional fallback when net_unit_cost is not set on the line. */
  unitPrice?: number | string | null;
  /** Whether the line is matched to an Items Master product. */
  matched?: boolean;
}

function toPositiveNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Resolve the purchase-to-stock quantity: supplier record wins, product master is the fallback. */
export function resolvePurchaseToStockQty(src: ConversionSource): number | null {
  return toPositiveNumber(src.supplierStockQty) ?? toPositiveNumber(src.productStockQty);
}

/**
 * Returns cost per stock unit, or null when it cannot be determined deterministically.
 */
export function computeNormalizedUnitCost(input: NormalizedCostInput): number | null {
  if (input.matched === false) return null;
  const net = toPositiveNumber(input.netUnitCost) ?? toPositiveNumber(input.unitPrice);
  if (net === null) return null;
  const qty = resolvePurchaseToStockQty(input);
  if (qty === null) return null;
  return Number((net / qty).toFixed(6));
}
