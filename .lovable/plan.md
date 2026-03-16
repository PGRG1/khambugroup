

## Plan: Mandatory Product Master Matching, Price Change Detection, and CSV Downloads

### 1. Mandatory Product Master Matching — Flag Unmatched Items

**Current behavior**: Unmatched items (no `matched_sku`) only get an amber background. The user wants it treated as a problem that MUST be flagged prominently.

**Changes in `InvoiceScanner.tsx`**:
- Add an `unmatched` flag to `ScannedLineItem` (true when `matched_sku` is empty after scan)
- Show a red "Unmatched" badge on each unmatched line item row with a red background highlight
- Add a top-level warning banner (red) when ANY line items are unmatched: "X item(s) not matched to Product Master — review required"
- Track `hasUnmatchedItems` alongside existing `hasSkuMismatches`

### 2. Price Change Detection — Flag Price Differences vs Product Master

**Changes in `ProcurementInvoicesTab.tsx`**:
- Expand the product master fetch to include `purchase_unit_cost` field

**Changes in `InvoiceScanner.tsx`**:
- Expand `ProductMasterEntry` interface to include `purchase_unit_cost`
- Add `price_changed` flag to `ScannedLineItem`
- After scan, for each matched line item, compare the scanned `unit_price` against the Product Master's `purchase_unit_cost`
- If they differ, set `price_changed: true` and store the expected price as `pm_unit_price`
- Show a blue info badge on the line item: "Price changed: was $X → now $Y"
- Add a top-level info banner summarizing price changes

### 3. CSV Download Button on Each Procurement Tab

**Changes across all 5 tab components** (`ProductMasterTab.tsx`, `ProcurementInvoicesTab.tsx`, `ProcurementLineItemsTab.tsx`, `InventoryOnHandTab.tsx`, `MenuCostingTab.tsx`):
- Add a `Download` icon button in each tab's toolbar/header area
- On click, generate a CSV from the currently filtered/displayed data
- Use `Blob` + `URL.createObjectURL` + temporary `<a>` element to trigger download
- File naming: `product_master_YYYY-MM-DD.csv`, `invoices_YYYY-MM-DD.csv`, `invoice_line_items_YYYY-MM-DD.csv`, `inventory_YYYY-MM-DD.csv`, `menu_costing_YYYY-MM-DD.csv`
- Each CSV includes all visible columns in the table

### Files to Change

1. **`src/components/invoices/InvoiceScanner.tsx`** — unmatched item flags, price change detection, expanded interface
2. **`src/components/procurement/ProcurementInvoicesTab.tsx`** — fetch `purchase_unit_cost` in product master query, add CSV download
3. **`src/components/procurement/ProductMasterTab.tsx`** — add CSV download button
4. **`src/components/procurement/ProcurementLineItemsTab.tsx`** — add CSV download button
5. **`src/components/procurement/InventoryOnHandTab.tsx`** — add CSV download button
6. **`src/components/procurement/MenuCostingTab.tsx`** — add CSV download button

