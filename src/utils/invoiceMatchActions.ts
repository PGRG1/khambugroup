/**
 * Invoice scanner match actions.
 *
 * "Change match" replaces the Product Master link in one atomic update, and
 * "Remove match" clears only the link — never the scanned invoice evidence
 * (external name/SKU, quantities, prices, units, tax, notes).
 */

export interface MatchableLine {
  item_code: string;
  description: string;
  scanned_item_code?: string;
  scanned_description?: string;
  matched_sku: string;
  matched_internal_name: string;
  matched_stock_uom: string;
  matched_purchase_uom: string;
  matched_stock_qty_ratio?: number;
  product_master_id?: string | null;
  supplier_entry_id?: string | null;
  unmatched?: boolean;
  sku_mismatch?: boolean;
  auto_matched?: boolean;
  auto_match_score?: number;
  [key: string]: unknown;
}

export interface MatchTargetEntry {
  id: string;
  supplier_entry_id?: string;
  internal_sku: string;
  internal_product_name: string;
  supplier_product_name?: string;
  external_sku?: string;
  purchase_unit?: string;
  stock_uom?: string;
  stock_qty?: number;
}

/**
 * Fields written when a match is set or changed.
 *
 * Source truth is immutable: the printed/scanned external name and SKU are never
 * replaced by Product Master values. Only the internal match fields are populated.
 */
export function buildMatchLinkPatch<T extends MatchableLine>(line: T, entry: MatchTargetEntry) {
  const scannedCode = line.scanned_item_code ?? line.item_code;
  const scannedDesc = line.scanned_description ?? line.description;
  return {
    scanned_item_code: scannedCode,
    scanned_description: scannedDesc,
    description: scannedDesc,
    item_code: scannedCode,
    matched_sku: entry.internal_sku,
    matched_internal_name: entry.internal_product_name || "",
    matched_stock_uom: entry.stock_uom || "",
    matched_purchase_uom: entry.purchase_unit || "",
    matched_stock_qty_ratio: entry.stock_qty ?? 1,
    product_master_id: entry.id,
    supplier_entry_id: entry.supplier_entry_id ?? null,
    unmatched: false,
    sku_mismatch: false,
  };
}

/**
 * Fields written by "Remove match": the line keeps every scanned value and becomes an
 * explicit "Unmatched — select or create item" row. No invoice line and no Product Master
 * record is deleted.
 */
export function buildRemoveMatchPatch<T extends MatchableLine>(line: T) {
  return {
    item_code: line.scanned_item_code ?? line.item_code,
    description: line.scanned_description ?? line.description,
    scanned_item_code: line.scanned_item_code ?? line.item_code,
    scanned_description: line.scanned_description ?? line.description,
    matched_sku: "",
    matched_internal_name: "",
    matched_stock_uom: "",
    matched_purchase_uom: "",
    matched_stock_qty_ratio: 1,
    product_master_id: null as string | null,
    supplier_entry_id: null as string | null,
    unmatched: true,
    sku_mismatch: false,
    auto_matched: false,
    auto_match_score: undefined as number | undefined,
  };
}

/** Label for the explicit unmatched state shown after Remove match. */
export const UNMATCHED_STATE_LABEL = "Unmatched — select or create item";
