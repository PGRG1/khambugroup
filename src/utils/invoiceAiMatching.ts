import { normalizeSupplierKey } from "@/components/invoices/SupplierQuickCreateSheet";

/**
 * Strict supplier scoping. Supplier-facing master data (External Name, External SKU,
 * purchase UOM/cost, stock UOM/conversion) may only ever come from a product_suppliers
 * row whose normalized supplier name equals the selected invoice supplier.
 * No partial / contains matching — that leaks another supplier's wording onto a line.
 */
export const scopePMToSupplier = <T extends { supplier?: string | null }>(
  pm: T[] | undefined,
  supplierName?: string,
): T[] => {
  if (!pm) return [];
  const norm = normalizeSupplierKey(supplierName || "");
  if (!norm) return [];
  return pm.filter((entry) => entry.supplier && normalizeSupplierKey(entry.supplier) === norm);
};

export interface AiMatchInvoiceLike {
  supplier_id?: string | null;
  supplier_name?: string | null;
}

export interface AiMatchSupplierLike {
  id: string;
  name: string;
}

export type AiMatchScope<T extends { supplier?: string | null } = { supplier?: string | null }> =
  | { status: "no_supplier" }
  | { status: "no_products"; supplierName: string }
  | { status: "ok"; supplierName: string; scopedPM: T[] };

/**
 * Resolve the supplier scope for AI matching.
 *
 * supplier_id is mandatory. The canonical supplier record's name (looked up by id)
 * is used for scoping — the raw/short OCR supplier_name (e.g. "Ming Kee Seafood")
 * must NOT be used, because strict scoping would then match zero rows for a
 * canonical supplier like "Ming Kee Seafood Company Limited".
 */
export const resolveAiMatchScope = <T extends { supplier?: string | null }>(
  allSuppliers: AiMatchSupplierLike[],
  inv: AiMatchInvoiceLike | null | undefined,
  productMaster: T[] | undefined,
): AiMatchScope<T> => {
  const supplierId = inv?.supplier_id;
  if (!supplierId) return { status: "no_supplier" };
  // Canonical name wins; fall back to the OCR name only for a just-created/local
  // supplier that is not yet present in allSuppliers.
  const canonicalName = allSuppliers.find((s) => s.id === supplierId)?.name;
  const supplierName = canonicalName || inv?.supplier_name || "";
  const scopedPM = scopePMToSupplier(productMaster, supplierName);
  if (!scopedPM.length) return { status: "no_products", supplierName };
  return { status: "ok", supplierName, scopedPM };
};
