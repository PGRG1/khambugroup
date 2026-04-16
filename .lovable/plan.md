

## Plan: Align Invoices.tsx edit dialog with Procurement's product matching logic

### Problem
The edit invoice dialog in `src/pages/Invoices.tsx` (accessible from `/invoices`) has `ProductAutocomplete` dropdowns on External SKU and External Name, but the `updateEditLine` function (line 405) does **not** call `resolveProductMatch` when the user types — it only updates the raw text. This means:
- Typing an External SKU doesn't auto-fill External Name
- Typing an External Name doesn't auto-fill External SKU
- No automatic product resolution happens on manual text entry

The Procurement version (`ProcurementInvoicesTab.tsx`) already has full resolution logic. This fix brings the old Invoices page in line.

### Changes

**File: `src/pages/Invoices.tsx`**

1. **Add `resolveProductMatch` import** (around line 6): Import the shared resolver utility.

2. **Update `updateEditLine` (lines 405-417)**: Add product resolution logic when `field === "item_code"` or `field === "description"`, mirroring the same pattern from `ProcurementInvoicesTab.tsx` lines 409-461. On match:
   - Auto-fill `item_code` (External SKU) from resolved entry
   - Auto-fill `description` (External Name) when SKU field triggers the match
   - Set `matched_sku`, `matched_internal_name`, `matched_stock_uom`, `matched_purchase_uom`, `matched_stock_qty_ratio`, `product_master_id`
   - Clear `unmatched` flag
   - Detect price changes vs PM unit price

3. **Pass `currentSupplier` to both `ProductAutocomplete` instances** (lines 1068 and 1081): Add the `currentSupplier` prop using the supplier name from `editSupplierName`, so autocomplete suggestions prioritize the invoice's supplier.

### No database changes needed.

