
The user wants the edit invoice flows (in `Invoices.tsx` and `ProcurementInvoicesTab.tsx`) to mirror the scanner's PM-authoritative SKU behavior: when a user picks a product whose Product Master entry has an empty `external_sku`, the line's External SKU must become empty (not retain the previously scanned code).

Earlier flattening was already fixed (`s.external_sku ?? ""`). Need to verify both edit `selectEditProduct` handlers force `item_code = product.external_sku || ""` with no fallback to current scanned value.

## Plan: Mirror scanner's PM-authoritative SKU logic in edit invoice flows

### Goal
When editing an invoice line and selecting a product (by name) from autocomplete:
- The line's External SKU must be overwritten with the Product Master's `external_sku` for that supplier
- If the PM entry has an empty SKU, the line's SKU becomes empty — no fallback to scanned/typed code

### Files to update
1. **`src/pages/Invoices.tsx`** — `selectEditProduct` (and any related "apply product to line" handler)
2. **`src/components/procurement/ProcurementInvoicesTab.tsx`** — `selectEditProduct` (and any related handler)

### Changes
- Force `item_code: product.external_sku ?? ""` (drop any `|| line.item_code` fallback)
- Also overwrite related supplier-scoped fields from PM (description / supplier name / unit / unit_price defaults) to match scanner behavior — only the SKU empty-respect is the bug, but verify these don't fall back to scanned values either
- Keep BW invoice logic untouched

### Verification
1. Open edit dialog on a Ming Kee invoice line that has a scanned `item_code`
2. In the product name autocomplete, select `Rose Extra Sp. Wheat Flour 50lb`
3. External SKU field clears to empty
4. Save and reopen → still empty
5. On a supplier with real SKUs (e.g., Beverage World), selecting a product still fills the correct SKU
