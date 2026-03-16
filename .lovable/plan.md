

## Plan: Update Base Unit and Base Qty for All Products

### What
Run a database migration to set `base_unit_type` and `base_unit_qty` for all existing products in `product_master` based on the data provided by the user.

### How
A single SQL migration with UPDATE statements matching each product by `internal_sku`, setting the correct `base_unit_type` and `base_unit_qty`. Also recalculate `cost_per_base_unit = purchase_unit_cost / base_unit_qty` for each updated row.

### Migration SQL
- ~113 UPDATE statements, one per SKU (BEV-0001 through BEV-0105, DAI-0001, FRZ-0001 through FRZ-0004, PRO-0001, PRO-0002, SAU-0001, SPE-0001)
- Each sets `base_unit_type` (ml, gms, or pcs) and `base_unit_qty` from the provided data
- A final UPDATE recalculates `cost_per_base_unit = purchase_unit_cost / base_unit_qty` for all rows where `base_unit_qty > 0`

### Files Changed
1. **New migration SQL** — bulk UPDATE of `base_unit_type` and `base_unit_qty` per SKU, then recalculate `cost_per_base_unit`

No frontend changes needed — the UI already displays and manages these fields.

