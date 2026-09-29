export const NO_SUPPLIER_ENTRY_MESSAGE = "This item has no Items Master entry for this supplier";

export interface SupplierCostRow {
  id: string;
  product_master_id: string;
  stock_qty?: number | null;
  base_unit_qty?: number | null;
}

export interface ProductCostRow {
  id: string;
  stock_qty?: number | null;
  base_unit_qty?: number | null;
}

export interface SupplierPriceUpdateDependencies {
  updateSupplier: (supplierEntryId: string, productMasterId: string, newPrice: number) => Promise<SupplierCostRow | null>;
  readProduct: (productMasterId: string) => Promise<ProductCostRow | null>;
  updateProduct: (productMasterId: string, payload: {
    purchase_unit_cost: number;
    cost_per_stock_unit: number;
    cost_per_base_unit: number;
  }) => Promise<boolean>;
  refreshParent: () => void | Promise<void>;
}

export type SupplierPriceUpdateResult =
  | { ok: true; costPerStockUnit: number; costPerBaseUnit: number }
  | { ok: false; message: string };

const positiveDivisor = (supplierValue?: number | null, productValue?: number | null) => {
  const supplierNumber = Number(supplierValue);
  if (Number.isFinite(supplierNumber) && supplierNumber > 0) return supplierNumber;
  const productNumber = Number(productValue);
  return Number.isFinite(productNumber) && productNumber > 0 ? productNumber : 0;
};

export function calculateSupplierItemCosts(
  newPrice: number,
  supplier: SupplierCostRow,
  product: ProductCostRow,
) {
  const stockQty = positiveDivisor(supplier.stock_qty, product.stock_qty);
  const baseQty = positiveDivisor(supplier.base_unit_qty, product.base_unit_qty);
  return {
    purchase_unit_cost: newPrice,
    cost_per_stock_unit: stockQty > 0 ? newPrice / stockQty : 0,
    cost_per_base_unit: baseQty > 0 ? newPrice / baseQty : 0,
  };
}

export async function updateSupplierItemPrice(
  deps: SupplierPriceUpdateDependencies,
  input: { supplierEntryId?: string | null; productMasterId?: string | null; newPrice: number },
): Promise<SupplierPriceUpdateResult> {
  if (!input.supplierEntryId || !input.productMasterId) {
    return { ok: false, message: NO_SUPPLIER_ENTRY_MESSAGE };
  }

  const supplier = await deps.updateSupplier(input.supplierEntryId, input.productMasterId, input.newPrice);
  if (!supplier) return { ok: false, message: "No supplier price row was updated." };

  const product = await deps.readProduct(input.productMasterId);
  if (!product) return { ok: false, message: "The linked Items Master item was not found." };

  const costs = calculateSupplierItemCosts(input.newPrice, supplier, product);
  const productUpdated = await deps.updateProduct(input.productMasterId, costs);
  if (!productUpdated) return { ok: false, message: "No Items Master item row was updated." };

  await deps.refreshParent();
  return { ok: true, costPerStockUnit: costs.cost_per_stock_unit, costPerBaseUnit: costs.cost_per_base_unit };
}