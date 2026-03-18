

## Plan: Add 22 Telford International Products to Product Master

This is a data insertion task — 22 new products from **Telford International Company Limited** (a new supplier) need to be added to the `product_master` and `product_suppliers` tables.

### Data Summary
- **Supplier**: Telford International Company Limited (new — not in current list)
- **Products**: 22 items across Beverages (draft beer, wine, liqueur, cognac), Operating Supplies (coasters, glassware, stirrers, paper cups, beer towers, CO2 gas), and Deposits (keg deposits)

### Implementation

**Step 1: Insert into `product_master`** — 22 rows with fields:
- `internal_sku`, `internal_product_name`, `level1_category`, `level2_category`, `level3_category`, `status = 'Active'`
- `purchase_unit`, `base_unit_type`, `base_unit_qty`, `cost_per_base_unit`
- `unit_cost` (mapped from the Unit Cost column)
- Legacy fields (`external_sku`, `supplier_product_name`, `supplier`) left as defaults since the real data goes into `product_suppliers`

**Step 2: Insert into `product_suppliers`** — 22 corresponding rows linking each product to "Telford International Company Limited" with:
- `external_sku`, `supplier_product_name`, `purchase_unit`, `purchase_unit_cost`, `status = 'Active'`
- `product_master_id` referencing the newly created product_master entries

This will be done via two SQL operations using the data insertion tool. The supplier will automatically appear in the Invoice scanner/edit dropdowns since those are derived dynamically from Product Master data.

### Notes
- Base Unit mapping: most items use `ml` or `pcs` based on the data
- Cost/Base is derived as `unit_cost / base_unit_qty`
- Items with Unit Cost = 0 (operating supplies, some deposits) will have `cost_per_base_unit = 0`

