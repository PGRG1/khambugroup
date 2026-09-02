/**
 * Stock UOM model rules for the invoice scanner Quick Add form.
 *
 * - Stock UOM is the single canonical internal inventory UOM, stored on product_master
 *   (`stock_uom`, mirrored into the legacy `unit` column).
 * - Purchase UOM and the purchase -> stock conversion quantity are supplier-specific
 *   (`product_suppliers.purchase_unit` / `stock_qty`) and are NEVER derived from Stock UOM.
 */

export interface ProductMasterUomRow {
  stock_uom?: string | null;
  /** Legacy single-unit column, only used when `stock_uom` is genuinely empty. */
  unit?: string | null;
}

/** Canonical internal Stock UOM for a product, falling back to the legacy `unit` column. */
export function resolveCanonicalStockUom(row: ProductMasterUomRow | null | undefined): string {
  const stockUom = (row?.stock_uom || "").trim();
  if (stockUom) return stockUom;
  return (row?.unit || "").trim();
}

/**
 * A confirmation is required only when a non-empty canonical Stock UOM is being replaced
 * by a different value. Setting a blank canonical UOM for the first time is not a change.
 */
export function requiresStockUomConfirmation(canonical: string, next: string): boolean {
  const current = (canonical || "").trim();
  const target = (next || "").trim();
  if (!current || !target) return false;
  return current.toLowerCase() !== target.toLowerCase();
}

/** Fields written to product_master when the canonical Stock UOM is set or changed. */
export function buildProductMasterStockUomUpdate(next: string): { unit: string; stock_uom: string } {
  const value = (next || "").trim();
  return { unit: value, stock_uom: value };
}

/**
 * Fields synchronised onto every product_suppliers row of the product when the canonical
 * Stock UOM changes. Purchase UOM and conversion quantity are deliberately untouched.
 */
export function buildSupplierStockUomSync(next: string): { stock_uom: string } {
  return { stock_uom: (next || "").trim() };
}

export interface SupplierUomInput {
  purchaseUnit: string;
  stockUom: string;
  stockQty: number | string;
}

/** Supplier-scoped UOM payload; purchase and stock UOM stay independent values. */
export function buildSupplierUomPayload(input: SupplierUomInput): {
  purchase_unit: string;
  stock_uom: string;
  stock_qty: number;
} {
  const qty = typeof input.stockQty === "number" ? input.stockQty : parseFloat(input.stockQty || "");
  return {
    purchase_unit: (input.purchaseUnit || "").trim(),
    stock_uom: (input.stockUom || "").trim(),
    stock_qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
  };
}
