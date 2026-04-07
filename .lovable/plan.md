

## Fix: Stop Writing Supplier-Specific Fields to Shared Product Master Row

### Problem
When updating a product that shares an internal SKU with other suppliers, the save handler writes supplier-specific fields (`external_sku`, `supplier_product_name`, `supplier`, `purchase_unit`, `purchase_unit_cost`, `stock_uom`, `stock_qty`, etc.) to the `product_master` table. This overwrites the shared row with one supplier's data, causing incorrect External SKUs (and other supplier-level values) to appear for other suppliers.

### Fix

**File: `src/components/procurement/ProductMasterTab.tsx`**

Strip supplier-level fields from `pmUpdates` so only true product-level fields are written to `product_master`:

```text
pmUpdates = {
  internal_sku, internal_product_name,
  level1_category, level2_category, level3_category,
  unit, unit_cost, status, notes
}
```

All supplier-specific fields remain exclusively in `supplierLevelFields` and are written only to the `product_suppliers` table:

```text
supplierLevelFields = {
  supplier, external_sku, supplier_product_name,
  purchase_unit, purchase_unit_cost,
  stock_uom, stock_qty,
  base_unit_type, base_unit_qty,
  status
}
```

This ensures editing one supplier's entry never contaminates the shared `product_master` record. The table display already pulls `external_sku` from `supplier_entry` (line 97), so no UI changes are needed.

### Scope
- Single file change: `src/components/procurement/ProductMasterTab.tsx` (lines 235-245)
- No database changes

