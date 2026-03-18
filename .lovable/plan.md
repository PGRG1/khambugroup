

## Problem

The ProductAutocomplete dropdown in the Invoice Scanner shows **internal SKUs** (e.g., `JUI-0001`) and falls back to **internal product names** when supplier data is missing. The user wants:

1. **Description field**: When typing, search only against `supplier_product_name`. Display supplier product name in dropdown. On select, fill description with `supplier_product_name`.
2. **Code field**: Search only against `external_sku`. Display external SKU in dropdown. On select, fill code with `external_sku` (leave empty if no external SKU exists).
3. **Dropdown display**: Show `external_sku` (blank if empty) and `supplier_product_name` — never fall back to internal SKU/name.

## Changes

### 1. Update `ProductAutocomplete.tsx`

- **Search logic**: For `searchField="name"`, search only `supplier_product_name`. For `searchField="code"`, search only `external_sku`.
- **Dropdown display**: Show `p.external_sku` (not falling back to `p.internal_sku`) and `p.supplier_product_name` (not falling back to `p.internal_product_name`). Skip rendering SKU portion if `external_sku` is empty.
- Filter out products that have no `supplier_product_name` (they can't be meaningfully matched from an invoice context).

### 2. Update `selectProduct()` in `InvoiceScanner.tsx`

- Set `item_code` to `product.external_sku` only (empty string if none exists, not falling back to `internal_sku`).
- Keep `description` as `product.supplier_product_name || product.internal_product_name` (supplier name is the priority, internal is last resort).

