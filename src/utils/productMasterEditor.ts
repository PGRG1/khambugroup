import type { ProductMasterItem, ProductSupplierEntry } from "@/hooks/useProductMaster";

export interface ProductMasterEditorForm {
  internal_sku: string;
  internal_product_name: string;
  level1_category: string;
  level2_category: string;
  level3_category: string;
  accounting_category: string;
  financial_treatment: string;
  default_coa_account_id: string;
  status: string;
  notes: string;
  stock_uom: string;
  base_unit_type: string;
  base_unit_qty: string;
  min_stock_qty: string;
  reorder_qty: string;
  creates_stock_movement: boolean;
  purchase_yield: string;
  cooking_yield: string;
  supplier_product_name: string;
  external_sku: string;
  purchase_unit: string;
  purchase_unit_cost: string;
  stock_qty: string;
  supplier_accounting_category: string;
  supplier_status: string;
}

const nullableNumber = (value: string): number | null => {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function productMasterEditorForm(product: ProductMasterItem, supplier: ProductSupplierEntry | null): ProductMasterEditorForm {
  return {
    internal_sku: product.internal_sku || "",
    internal_product_name: product.internal_product_name || "",
    level1_category: product.level1_category || "",
    level2_category: product.level2_category || "",
    level3_category: product.level3_category || "",
    accounting_category: product.accounting_category || "",
    financial_treatment: product.financial_treatment || "",
    default_coa_account_id: product.default_coa_account_id || "",
    status: product.status || "Active",
    notes: product.notes || "",
    stock_uom: product.stock_uom || product.unit || "",
    base_unit_type: supplier?.base_unit_type || product.base_unit_type || "",
    base_unit_qty: String(supplier?.base_unit_qty ?? product.base_unit_qty ?? 1),
    min_stock_qty: (product as any).min_stock_qty == null ? "" : String((product as any).min_stock_qty),
    reorder_qty: (product as any).reorder_qty == null ? "" : String((product as any).reorder_qty),
    creates_stock_movement: product.creates_stock_movement ?? true,
    purchase_yield: String(product.purchase_yield ?? 100),
    cooking_yield: String(product.cooking_yield ?? 100),
    supplier_product_name: supplier?.supplier_product_name || "",
    external_sku: supplier?.external_sku || "",
    purchase_unit: supplier?.purchase_unit || "",
    purchase_unit_cost: String(supplier?.purchase_unit_cost ?? product.purchase_unit_cost ?? 0),
    stock_qty: String(supplier?.stock_qty ?? product.stock_qty ?? 1),
    supplier_accounting_category: (supplier as any)?.accounting_category || product.accounting_category || "",
    supplier_status: supplier?.status || product.status || "Active",
  };
}

export function validateProductMasterEditor(form: ProductMasterEditorForm): string | null {
  if (!form.internal_sku.trim()) return "Internal SKU is required.";
  if (!form.internal_product_name.trim()) return "Internal product name is required.";
  if (!form.stock_uom.trim()) return "Stock UOM (internal) is required.";
  if (!form.purchase_unit.trim()) return "Purchase UOM is required.";
  const purchaseCost = Number(form.purchase_unit_cost);
  const stockQty = Number(form.stock_qty);
  const baseQty = Number(form.base_unit_qty);
  if (!Number.isFinite(purchaseCost) || purchaseCost < 0) return "Purchase cost must be zero or greater.";
  if (!Number.isFinite(stockQty) || stockQty <= 0) return "Purchase-to-stock quantity must be greater than zero.";
  if (!Number.isFinite(baseQty) || baseQty <= 0) return "Recipe/base quantity must be greater than zero.";
  const purchaseYield = Number(form.purchase_yield);
  const cookingYield = Number(form.cooking_yield);
  if (!Number.isFinite(purchaseYield) || purchaseYield < 1 || purchaseYield > 100) return "Purchase yield must be between 1% and 100%.";
  if (!Number.isFinite(cookingYield) || cookingYield < 1 || cookingYield > 100) return "Cooking yield must be between 1% and 100%.";
  return null;
}

export function buildProductMasterEditorPayload(form: ProductMasterEditorForm) {
  const purchaseCost = Number(form.purchase_unit_cost);
  const stockQty = Number(form.stock_qty);
  const baseQty = Number(form.base_unit_qty);
  return {
    product: {
      internal_sku: form.internal_sku.trim(),
      internal_product_name: form.internal_product_name.trim(),
      level1_category: form.level1_category.trim(),
      level2_category: form.level2_category.trim(),
      level3_category: form.level3_category.trim(),
      accounting_category: form.accounting_category.trim(),
      financial_treatment: form.financial_treatment.trim(),
      default_coa_account_id: form.default_coa_account_id || null,
      status: form.status,
      notes: form.notes.trim() || null,
      unit: form.stock_uom.trim(),
      stock_uom: form.stock_uom.trim(),
      base_unit_type: form.base_unit_type.trim(),
      base_unit_qty: baseQty,
      min_stock_qty: nullableNumber(form.min_stock_qty),
      reorder_qty: nullableNumber(form.reorder_qty),
      creates_stock_movement: form.creates_stock_movement,
      purchase_yield: Number(form.purchase_yield),
      cooking_yield: Number(form.cooking_yield),
      cost_per_base_unit: baseQty > 0 ? purchaseCost / baseQty : 0,
    },
    supplier: {
      supplier_product_name: form.supplier_product_name.trim(),
      external_sku: form.external_sku.trim(),
      purchase_unit: form.purchase_unit.trim(),
      purchase_unit_cost: purchaseCost,
      stock_qty: stockQty,
      stock_uom: form.stock_uom.trim(),
      base_unit_type: form.base_unit_type.trim(),
      base_unit_qty: baseQty,
      accounting_category: form.supplier_accounting_category.trim(),
      status: form.supplier_status,
    },
    cost_per_stock_unit: stockQty > 0 ? purchaseCost / stockQty : 0,
  };
}

export function syncCanonicalStockUomPayload(stockUom: string) {
  return { stock_uom: stockUom.trim() };
}

export function preservesInvoiceLineValues<T extends Record<string, unknown>>(line: T) {
  return {
    quantity: line.quantity,
    unit_price: line.unit_price,
    discount: line.discount,
    discount_mode: line.discount_mode,
    discount_rate: line.discount_rate,
    tax_amount: line.tax_amount,
    accepted_qty: line.accepted_qty,
    accepted_price: line.accepted_price,
  };
}
