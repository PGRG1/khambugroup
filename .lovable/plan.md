

## Fix: Apply Beverage World rounding to scanner-parsed line totals

### Root cause
In `src/components/invoices/InvoiceScanner.tsx`:

1. **Line 408** — when AI-parsed line items are loaded, `total` is computed with `toFixed(2)` regardless of supplier. Even if the supplier is Beverage World HK, parsed lines display as `440.02`, `350.02`, `229.99` etc.
2. **Line 490 `handleSupplierChange`** — when the user changes the supplier to Beverage World HK after parsing, existing line totals are never re-rounded.

The display column at line 1208 reads `line.total` directly from state, so unless `updateLine` is called for that specific line, the un-rounded parsed value stays visible. (The invoice-level `calcLineTotal` at line 604 does round correctly for the summary — that's why the *invoice total* is right but *line totals* aren't.)

### Changes (single file: `src/components/invoices/InvoiceScanner.tsx`)

**A. Round at parse time (line 408)**
Inside the `.map((li) => …)` at lines 390-415, compute the raw line total once and round it when `supplierName` matches Beverage World:
```ts
const isBW = supplierName.toLowerCase().includes("beverage world");
const rawTotal = ((Number(li?.quantity) || 0) * (Number(li?.unit_price) || 0))
                 - (Number(li?.discount) || 0) + (Number(li?.tax_amount) || 0);
const total = isBW ? String(Math.round(rawTotal)) : String(rawTotal.toFixed(2));
```
Use `total` in the returned object.

**B. Re-round all existing line totals when supplier changes (line 496-504)**
In `handleSupplierChange`, after setting the new supplier, recompute every `line.total` for the active invoice using the same BW helper. If the new supplier is Beverage World, round each line; if switching away from BW, recompute with `toFixed(2)`.

### Notes
- No other files need editing — the edit dialogs in `ProcurementInvoicesTab.tsx` and `Invoices.tsx` already handle BW rounding correctly via `hydrateEditLine` / `calculateEditLineTotal`.
- No DB schema changes.
- After fix: the screenshot's lines like `440.02 → 440`, `350.02 → 350`, `229.99 → 230`, `324.96 → 325`, `185.04 → 185`, `429.98 → 430` will all display as whole-dollar values (shown as `440.00`, `230.00`, etc. since the input keeps `.00` formatting via `toFixed`-style storage — actually since we store `String(Math.round(raw))` it'll show as `"440"`; the existing display logic accepts that).

