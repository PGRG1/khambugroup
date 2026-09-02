/**
 * Setup Health for Items Master (Procurement > Products).
 *
 * Pure, client-side derivation of "is this product/supplier row properly configured?".
 * No schema changes — everything is derived from existing product_master /
 * product_suppliers fields.
 */

export interface SetupHealthInput {
  internal_sku?: string | null;
  internal_product_name?: string | null;
  supplier?: string | null;
  supplier_product_name?: string | null;
  /** True when this row represents a supplier-scoped purchasing line. */
  supplier_scoped?: boolean;
  level1_category?: string | null;
  level2_category?: string | null;
  level3_category?: string | null;
  financial_treatment?: string | null;
  default_coa_account_id?: string | null;
  purchase_unit?: string | null;
  purchase_unit_cost?: number | null;
  creates_stock_movement?: boolean | null;
  stock_uom?: string | null;
  stock_qty?: number | null;
  base_unit_type?: string | null;
  base_unit_qty?: number | null;
  purchase_yield?: number | null;
  cooking_yield?: number | null;
  status?: string | null;
}

export type SetupHealthState = "complete" | "needs_setup" | "inactive";

export interface SetupHealth {
  state: SetupHealthState;
  issues: string[];
  /** Issue count regardless of active/inactive state. */
  issueCount: number;
}

const blank = (v: unknown) => typeof v !== "string" || v.trim() === "";
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

export function computeSetupIssues(row: SetupHealthInput): string[] {
  const issues: string[] = [];

  // Identity
  if (blank(row.internal_sku)) issues.push("Internal SKU");
  if (blank(row.internal_product_name)) issues.push("Internal product name");

  // Supplier scope. External SKU stays optional — many suppliers don't use one.
  const supplierScoped = row.supplier_scoped ?? false;
  if (supplierScoped) {
    if (blank(row.supplier)) issues.push("Supplier");
    if (blank(row.supplier_product_name)) issues.push("Supplier product name");
  }

  // Category hierarchy — each missing level listed separately.
  if (blank(row.level1_category)) issues.push("Category L1");
  if (blank(row.level2_category)) issues.push("Category L2");
  if (blank(row.level3_category)) issues.push("Category L3");

  // Financial mapping
  if (blank(row.financial_treatment)) issues.push("Financial treatment");
  if (blank(row.default_coa_account_id)) issues.push("Default account mapping");

  // Purchasing
  if (blank(row.purchase_unit)) issues.push("Purchase UOM");

  const stockMoving = row.creates_stock_movement === true;
  const isCogs = (row.financial_treatment || "") === "COGS";
  const cost = num(row.purchase_unit_cost);
  if (cost === null) {
    issues.push("Purchase cost");
  } else if (cost < 0) {
    issues.push("Purchase cost (negative)");
  } else if (cost === 0 && stockMoving && isCogs) {
    // A legitimate zero is fine for non-stock / refund / non-COGS items only.
    issues.push("Purchase cost (zero)");
  }

  // Stock + recipe conversions only matter when the item moves stock.
  if (stockMoving) {
    if (blank(row.stock_uom)) issues.push("Stock UOM");
    const sq = num(row.stock_qty);
    if (sq === null || sq <= 0) issues.push("Purchase → stock quantity");

    if (blank(row.base_unit_type)) issues.push("Recipe / base UOM");
    const bq = num(row.base_unit_qty);
    if (bq === null || bq <= 0) issues.push("Recipe / base quantity");

    const py = num(row.purchase_yield);
    if (py === null || py <= 0) issues.push("Purchase yield");
    const cy = num(row.cooking_yield);
    if (cy === null || cy <= 0) issues.push("Cooking yield");
  }

  // Draft needs attention; Inactive is handled separately as a state.
  if ((row.status || "") === "Draft") issues.push("Status is Draft");

  return issues;
}

export function computeSetupHealth(row: SetupHealthInput): SetupHealth {
  const issues = computeSetupIssues(row);
  const active = (row.status || "Active") === "Active" || (row.status || "") === "Draft";
  const state: SetupHealthState = !active
    ? "inactive"
    : issues.length > 0
      ? "needs_setup"
      : "complete";
  return { state, issues, issueCount: issues.length };
}
