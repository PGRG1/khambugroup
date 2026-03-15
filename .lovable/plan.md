

## Plan: Update Invoice Line Items columns and remove Inventory from sidebar

### Changes

**1. Remove Inventory from sidebar** (`src/components/AppSidebar.tsx`)
- Remove the `{ title: "Inventory", ... }` entry from `navItems` array (line 24).

**2. Restructure Invoice Line Items columns** (`src/components/procurement/ProcurementLineItemsTab.tsx`)
- Rename "Product Description" to **"Supplier Product Name"** — this shows the raw OCR-extracted description as-is from the supplier.
- Rename "Master Name" to **"Internal Product Name"** — this is the standardized name from Product Master.
- Replace the single "Product No." column with two columns:
  - **Internal SKU** — from the matched `product_master` record
  - **External SKU** — from the matched `product_master` record
- Update the data fetch to also retrieve `internal_sku` and `external_sku` from `product_master`.
- Update the interface, column definitions, mapping logic, and row rendering accordingly.
- Adjust the `colSpan` in the footer to match the new column count (11 columns instead of 10).

### Updated column order

| Date | Supplier | Invoice # | Internal SKU | External SKU | Internal Product Name | Supplier Product Name | Qty | Unit | Unit Price | Net Amount |

### Technical details
- The `product_master` select query changes from `select("id, internal_product_name")` to `select("id, internal_product_name, internal_sku, external_sku")`.
- The `pmMap` becomes a map of `id → { name, sku, ext_sku }` objects instead of just strings.
- Unmatched rows will show "—" for both SKU columns and the amber "Unmatched" badge in the Internal Product Name column.

