

## Plan: Improve Scan Invoice line-items table UX + Beverage World per-line rounding

### Files to edit
- `src/components/invoices/InvoiceScanner.tsx` (table layout, totals, BW rounding)
- `src/components/invoices/ProductAutocomplete.tsx` (wider/taller dropdown)

### 1. Make External SKU & External Name fully editable + visible
The fields are already wired to `onChange` (lines 1100-1127), so they ARE editable — but the column width `w-[90px]` clips the text so it looks/feels uneditable. Fixing column widths (item #2) resolves this. No logic change needed; just stop forcing tiny widths.

### 2. Auto-size compact columns to content
Change the table to use `table-auto` (instead of fixed widths) for these columns and remove their `w-[…]` / `min-w-[…]` constraints so they grow to fit content:
- Internal SKU
- External SKU
- Purch. Qty
- Purch. Cost
- Discount
- Total

Also drop `min-w-[1500px]` from the table (line 1050) and replace with `min-w-full` so the table sizes naturally; horizontal scroll only appears if truly needed.

### 3. Wrap text in Internal Name & External Name (auto-grow height)
- **Internal Name** (line 1093): already uses `whitespace-normal break-words` ✓ — just give it a sensible `min-w-[180px]` and remove any `h-8`-style fixed heights nearby.
- **External Name** + **External SKU**: replace the `<Input>` inside `ProductAutocomplete` with a `<textarea>`-style element, OR keep `<input>` but switch to a wrapping contenteditable. **Simpler approach**: add a `multiline` prop to `ProductAutocomplete` — when true, render a `<textarea>` with `rows={1}` and `className` adding `whitespace-normal break-words resize-none overflow-hidden`, plus an auto-grow effect (`el.style.height = el.scrollHeight + 'px'` on input). Use `multiline` for External Name only (External SKU stays single-line since SKUs are short — its column will just widen).

### 4. Wider & taller autocomplete dropdown
In `ProductAutocomplete.tsx` (lines 177-184):
- Replace `left-0 right-0` with `left-0 min-w-[360px] w-max max-w-[600px]` so the dropdown is wider than the input cell.
- Change `max-h-48` (192px) to `max-h-96` (384px) so more rows are visible without scrolling.
- Keep the dropUp logic; recompute threshold to use the new height (~400px instead of 220px).

### 5. Beverage World per-line rounding
Currently each line total = `qty × price − discount + tax` to 2 decimals (line 548, 601-607, 647). For Beverage World HK only, round each **line total** to the nearest whole dollar before summing.

Implementation:
- Add helper `const roundLineForSupplier = (v: number, supplierName?: string) => supplierName?.toLowerCase().includes("beverage world") ? Math.round(v) : parseFloat(v.toFixed(2));`
- In `updateLine` (line 548): use the helper with `currentSupplierName`.
- In `calcLineTotal` (lines 601-607): apply rounding using the current supplier name.
- In the displayed line `total` `<Input>` (line 1202): show the rounded value for BW.
- In `doSaveCurrent` (line 647): persist `lineTotal` rounded via the helper, so DB matches what's displayed.
- The existing invoice-total rounding at line 617 stays as-is — but since each line is now already rounded for BW, the `calculatedTotal` will naturally be a whole-dollar sum (the example: 2 × 2.15 = 4.30 → rounds to **4** per line; multiple such lines sum to a whole number total).

### Notes
- No DB schema changes.
- All changes are scoped to the Scan Invoice dialog. Manual edit dialogs in `ProcurementInvoicesTab.tsx` and `Invoices.tsx` already share the same `ProductAutocomplete`, so the wider dropdown (#4) benefits them too — that's a positive side effect.
- Tooltip/legend behavior unchanged.

