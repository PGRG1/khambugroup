

## Fix: Product Master creation loses UOM fields after save

### Problem
When creating a new product, `stock_uom`, `stock_qty`, `base_unit_type`, and `base_unit_qty` are NOT passed to the `product_suppliers` insert. The `product_suppliers` table has defaults (`stock_uom: ''`, `stock_qty: 1`, `base_unit_type: 'g'`, `base_unit_qty: 1`), so those defaults overwrite what the user entered. Since the flat row display uses `s.stock_uom ?? p.stock_uom`, and `''` is not null/undefined, the empty string from the supplier row takes precedence over the correct value on `product_master`.

### Root cause
In `useProductMaster.ts` line 80, destructuring strips `supplier, external_sku, supplier_product_name, purchase_unit, purchase_unit_cost` into separate variables for the supplier insert. But `stock_uom, stock_qty, base_unit_type, base_unit_qty` are left in `pmData` (going to `product_master` only) and never included in the supplier insert on lines 103-106.

### Fix

**File: `src/hooks/useProductMaster.ts`**

1. **Destructure packaging fields** from product alongside the other supplier-level fields (line 80) — add `stock_uom, stock_qty, base_unit_type, base_unit_qty` to the destructured variables.

2. **Include packaging fields in the supplier insert** (lines 103-106) — add `stock_uom, stock_qty, base_unit_type, base_unit_qty` to the insert payload so the supplier entry stores the user's actual values instead of DB defaults.

### Technical detail
Single file change, ~5 lines modified. No database migration needed — the `product_suppliers` table already has these columns.

