

## Plan: Add Multi-Supplier Pricing for Products

### Problem
The `product_master` table correctly uses a unique constraint on `internal_sku` for inventory tracking. But the same product (e.g. BEV-0002 Campari) can be sourced from multiple suppliers at different prices. Currently, duplicate SKU inserts are simply skipped.

### Solution: New `product_suppliers` table

Create a separate table to store supplier-specific pricing and naming for each product, while keeping `product_master` as the single canonical product record.

```text
product_master (unique on internal_sku)     product_suppliers
┌──────────────────────────────────┐       ┌─────────────────────────────────┐
│ id (PK)                         │◄──────│ product_master_id (FK)          │
│ internal_sku (UNIQUE)            │       │ supplier                        │
│ internal_product_name            │       │ external_sku                    │
│ level1/2/3_category              │       │ supplier_product_name           │
│ base_unit_type, base_unit_qty    │       │ purchase_unit, purchase_unit_cost│
│ cost_per_base_unit               │       │ UNIQUE(product_master_id, supplier)│
│ ...                              │       └─────────────────────────────────┘
└──────────────────────────────────┘
```

### Changes

**1. Database migration**
- Create `product_suppliers` table with columns: `id`, `product_master_id` (FK), `supplier`, `external_sku`, `supplier_product_name`, `purchase_unit`, `purchase_unit_cost`, `status`, timestamps
- Add unique constraint on `(product_master_id, supplier)`
- Migrate existing supplier data from `product_master` rows into `product_suppliers`
- Add RLS policies matching `product_master` (read for authenticated, manage for admin/manager)

**2. Insert the 11 missing supplier records**
- For duplicates like BEV-0002 (Campari) that exist under "Beverage World HK", add a new row in `product_suppliers` for "Vintage Wines & Spirits Limited" with their pricing

**3. Update ProductMasterTab.tsx**
- Show supplier info by joining/fetching from `product_suppliers`
- Display multiple supplier rows per product (expandable or inline)
- Edit/add supplier pricing entries per product

**4. Update invoice scanner autocomplete**
- When matching by code/name, also show which suppliers offer the product and at what price
- On selection, set the `product_master_id` (same product regardless of supplier)

**5. Update InventoryOnHandTab.tsx**
- No change needed -- inventory already aggregates by `product_master_id`, which remains one-per-product

**6. Update MenuCostingTab.tsx**
- When selecting a product for ingredients, optionally show available supplier prices for reference cost

### Files modified
- Database: new `product_suppliers` table + data migration
- `src/hooks/useProductMaster.ts` -- fetch supplier pricing alongside products
- `src/components/procurement/ProductMasterTab.tsx` -- display multi-supplier info
- `src/components/invoices/InvoiceScanner.tsx` -- autocomplete shows supplier context
- `src/components/invoices/ProductAutocomplete.tsx` -- minor: show supplier in suggestions

