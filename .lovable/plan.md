

## Fix: Move per-supplier sizing fields from shared product_master to product_suppliers

### Problem
Fields like `stock_uom`, `stock_qty`, `base_unit_type`, `base_unit_qty` are stored on the shared `product_master` row. When two suppliers share the same Internal SKU (e.g., Korea Granulated Sugar — Ming Kee sends per Kg, ONGO sends per Bag of 30kg), editing the stock/recipe quantities for one supplier overwrites the values for the other.

### Solution
Move these per-supplier sizing fields into the `product_suppliers` table so each supplier entry has its own independent values.

### Changes

**1. Database migration** — Add columns to `product_suppliers`:
```sql
ALTER TABLE product_suppliers
  ADD COLUMN IF NOT EXISTS stock_uom text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stock_qty numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_unit_type text NOT NULL DEFAULT 'g',
  ADD COLUMN IF NOT EXISTS base_unit_qty numeric NOT NULL DEFAULT 1;

-- Backfill from product_master
UPDATE product_suppliers ps
SET stock_uom = pm.stock_uom,
    stock_qty = pm.stock_qty,
    base_unit_type = pm.base_unit_type,
    base_unit_qty = pm.base_unit_qty
FROM product_master pm
WHERE ps.product_master_id = pm.id;
```

**2. `src/hooks/useProductMaster.ts`** — Update `ProductSupplierEntry` interface to include `stock_uom`, `stock_qty`, `base_unit_type`, `base_unit_qty`. Update `updateSupplier` calls to pass these fields.

**3. `src/components/procurement/ProductMasterTab.tsx`**:
- **flatRows**: Read `stock_uom`, `stock_qty`, `base_unit_type`, `base_unit_qty` from the supplier entry (`s`) instead of from the product (`p`).
- **handleSave**: When updating, write these fields to the `product_suppliers` row via `updateSupplier` instead of (or in addition to) `updateProduct`. The shared `product_master` row should only get product-level fields (SKU, name, categories).
- **openEdit**: Populate form from the supplier entry's values for these fields.

This ensures each supplier entry independently stores its own packaging/sizing data.

