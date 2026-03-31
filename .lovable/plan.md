

## Upgrade Edit Invoice dialog to match Scanner's full entry view

### Problem
The Edit Invoice dialog only shows basic fields (Code, Description, Pack Size, Qty, Unit, Weight, Price, Tax) for line items. It is missing the Product Master integration fields that the Scanner provides: Internal SKU, Internal Product Name, Stock UOM, Purchase UOM, Stock Qty, Discount, Total, and the ProductAutocomplete matching. This means users cannot update or re-match line items against the Product Master after initial entry.

### Solution
Rebuild the Edit Invoice line items section to mirror the InvoiceScanner's line item layout, including:
- ProductAutocomplete for matching items against Product Master
- Read-only auto-populated fields: Internal SKU, Internal Product Name, Stock UOM, Purchase UOM
- Auto-calculated Stock Qty (Purchase Qty × PM ratio)
- Discount and Total columns
- Price mismatch highlighting

### Changes

**File: `src/pages/Invoices.tsx`**

1. **Expand `editLines` state shape** — Add fields: `matched_sku`, `matched_internal_name`, `matched_stock_uom`, `matched_purchase_uom`, `matched_stock_qty_ratio`, `discount`, `total`, `product_master_id`, `price_changed`, `pm_unit_price`.

2. **Update `openEdit`** — When loading existing line items, fetch Product Master data to populate the matched fields (query `product_master` + `product_suppliers` for each line item's `product_master_id`).

3. **Fetch Product Master entries** — Load the full product master list (similar to InvoiceScanner) so ProductAutocomplete can be used in edit mode.

4. **Replace the edit line items grid** — Replace the current simple grid (lines ~842-880) with the scanner-style layout:
   - External SKU field with ProductAutocomplete (code search)
   - Supplier Product Name with ProductAutocomplete (name search)
   - Read-only: Internal SKU, Internal Product Name, Stock UOM, Purchase UOM
   - Auto-calculated: Stock Qty
   - Editable: Purchase Qty, Unit Price, Discount, Tax
   - Auto-calculated: Total (line total)
   - Unmatched/price-changed visual indicators

5. **Update `handleEditSave`** — Include `product_master_id` and `discount` when building line items for save. Preserve matched PM fields.

6. **Add `handleProductMatch` for edit** — When a product is selected from autocomplete, populate the matched fields (same logic as InvoiceScanner's match handler).

### Technical notes
- Reuses the existing `ProductAutocomplete` component
- Product Master data fetch uses the same query pattern as InvoiceScanner
- The dialog width may need to increase (`max-w-5xl` or `max-w-6xl`) to accommodate the additional columns

