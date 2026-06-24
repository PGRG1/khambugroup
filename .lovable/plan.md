
## Goal
Apply UOM-only updates from `product_master_uom_cleaned.csv` (683 rows) to existing records, matched by Internal SKU + Supplier & Vendor. No new items, no deletions, no fields outside the UOM set touched. Empty CSV cells are skipped (existing values preserved).

## Approach
One-time data update against the database, scoped to the active KHAMBU tenant. Delivered via the migration tool (since `product_master` / `product_suppliers` are RLS-protected and writes need a migration).

### Steps

1. **Stage the CSV** into a temp table `_stg_uom` via `psql \copy` from `/mnt/user-uploads/product_master_uom_cleaned.csv`. Read all 28 columns from the file (header `Supplier & Vendor` cannot be aliased in `\copy`), then select into the working staging set with normalized names:
   - `internal_sku` ← Internal SKU
   - `supplier` ← Supplier & Vendor
   - `purch_uom` ← Purch. UOM
   - `stock_uom` ← Stock UOM
   - `stock_qty` ← Stock Qty (numeric)
   - `base_uom` ← Base/Recipe UOM
   - `base_qty` ← Base/Recipe Qty (numeric)
   
   Empty strings are converted to NULL during staging so the update logic can simply use `COALESCE(stg.x, target.x)` to preserve existing values.

2. **Preview** — report:
   - distinct staged Internal SKUs matched vs unmatched in `product_master` (tenant-scoped)
   - staged (SKU + supplier) pairs matched vs unmatched in `product_suppliers`
   - any SKU appearing multiple times in the CSV with conflicting Base/Recipe UOM/Qty (these will use the first occurrence for the product_master update; each supplier row still gets its own values)
   
   Unmatched rows are listed for review.

3. **Update `product_master`** (tenant-scoped, matched by `internal_sku`):
   - `base_unit_type` ← `COALESCE(stg.base_uom, base_unit_type)`
   - `base_unit_qty`  ← `COALESCE(stg.base_qty, base_unit_qty)`
   - Uses `DISTINCT ON (internal_sku)` to pick one row per SKU.

4. **Update `product_suppliers`** (tenant-scoped, matched by `product_master_id` + `supplier`):
   - `purchase_unit`   ← `COALESCE(stg.purch_uom, purchase_unit)`
   - `stock_uom`       ← `COALESCE(stg.stock_uom, stock_uom)`
   - `stock_qty`       ← `COALESCE(stg.stock_qty, stock_qty)`
   - `base_unit_type`  ← `COALESCE(stg.base_uom, base_unit_type)`
   - `base_unit_qty`   ← `COALESCE(stg.base_qty, base_unit_qty)`

5. **Verify** — return counts: `product_master` rows updated, `product_suppliers` rows updated, plus a small sample for spot-check. Drop the staging table.

### Notes
- No code changes. `ProductMasterTab.tsx` and other files are not touched.
- All matching is case-sensitive on supplier name as stored. If the preview shows a meaningful number of supplier-name mismatches, I'll stop and surface them before updating rather than guess at fuzzy matching.
