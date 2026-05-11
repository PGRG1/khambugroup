## Problem

On `/procurement/line-items`, the **External SKU** column does not show what was captured at scan time. In the screenshot, two different suppliers (Global Fine Foods code `1564020` vs ONGO Food Ltd code `81060529` for "Black Truffle Oil") both display External SKU `3761003` — the same value. That value is the *product master's* external SKU, not the SKU that was actually scanned and saved on each invoice line.

## Root Cause

`src/components/procurement/ProcurementLineItemsTab.tsx` builds each row like this:

```ts
const pm = pmId ? pmMap.get(pmId) : null;
...
external_sku: pm?.ext_sku || "",   // ← always from product_master
internal_sku: pm?.sku || "",
```

It never reads `invoice_line_items.item_code` — the field where the scanner stores the supplier code captured from the invoice. So once a line is matched to any product master, every row inherits that master's single `external_sku`, hiding the per-supplier code that was actually entered.

(Internal SKU correctly comes from the master because it is the canonical internal code; that part is fine.)

## Fix

In `ProcurementLineItemsTab.tsx`:

1. Include `item_code` in the `LineItemRow` type and in `buildRow()`.
2. Set `external_sku` from the **line item itself**:
   - `external_sku: li.item_code || pm?.ext_sku || ""`
   - Fallback to the master only when the line never had a scanned code (legacy rows).
3. Keep `internal_sku` sourced from the matched master (unchanged).
4. Update the searchable `_s` blob and the CSV download to use the new value (no extra column needed; same column, correct data).

That's the only change required to make the displayed External SKU match what was scanned. No DB migration, no scanner change — the data is already saved correctly in `invoice_line_items.item_code`; the page was just showing the wrong source.

## Verification

- Reload `/procurement/line-items`, search "truffle".
- Global Fine Foods row should show External SKU `1564020`-style scanned code (whatever is in that line's `item_code`), and ONGO row should show its own (`81060529`-style) scanned code — no longer identical.
- Rows with no `item_code` (older imports) still fall back to the master's external SKU so nothing goes blank.
- CSV export reflects the same corrected values.

## Files Touched

- `src/components/procurement/ProcurementLineItemsTab.tsx` (single component edit)
