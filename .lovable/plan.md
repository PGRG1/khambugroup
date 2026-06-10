## Scope
Only `src/components/invoices/InvoiceScanner.tsx` — Line Items table (lines ~1377–1572). No changes to `ProcurementInvoicesTab.tsx` or any other file.

## Changes

**1. Container + table element (line 1377–1378)**
- Wrapper: `overflow-x-auto -mx-2` → `overflow-x-auto w-full -mx-2`
- Table: `w-full text-xs border-collapse min-w-full table-auto` → `min-w-max text-xs border-collapse table-auto`

**2. Header `<th>` classes (lines 1381–1395)**
Apply ch-based widths matching each spec. Unchanged columns: `#`, `Internal Name` (keeps `min-w-[180px]`), `External Name` (keeps `min-w-[200px]`), `Status`, `Action`, trailing delete `<th className="w-8">`.

| Column | New `<th>` width classes (appended after existing text classes) |
|---|---|
| Internal SKU | `min-w-[9ch] shrink-0 whitespace-nowrap` |
| External SKU | `min-w-[8ch] shrink-0 whitespace-nowrap` |
| Purch. UOM | `w-[5ch] min-w-[5ch] max-w-[5ch] shrink-0 whitespace-nowrap` (replaces `w-[85px]`) |
| Purch. Qty | `w-[4ch] min-w-[4ch] max-w-[4ch] shrink-0 whitespace-nowrap` |
| Stock UOM | `w-[4ch] min-w-[4ch] max-w-[4ch] shrink-0 whitespace-nowrap` (replaces `w-[85px]`) |
| Stock Qty | `w-[4ch] min-w-[4ch] max-w-[4ch] shrink-0 whitespace-nowrap` (replaces `w-[90px]`) |
| Purch. Cost | `w-[6ch] min-w-[6ch] max-w-[6ch] shrink-0 whitespace-nowrap` |
| Discount | `w-[6ch] min-w-[6ch] max-w-[6ch] shrink-0 whitespace-nowrap` |
| Total | `w-[6ch] min-w-[6ch] max-w-[6ch] shrink-0 whitespace-nowrap` |

**3. Body `<td>` cells** (same lines per row)
Mirror the matching width classes on each fixed-width `<td>` so each cell inherits the column width (`shrink-0 whitespace-nowrap` + the `w-[Nch] min-w-[Nch] max-w-[Nch]` triplet for fixed cols; `min-w-[9ch]`/`min-w-[8ch] shrink-0 whitespace-nowrap` for SKU cols).

**4. Inputs inside fixed-width cells**
For the `<Input>` elements in: Purch. UOM, Purch. Qty, Stock UOM, Stock Qty, Purch. Cost, Discount, Total:
- Remove width classes: `w-full` only where paired with min-widths is fine, but strip `min-w-[85px]`, `min-w-[95px]`, `min-w-[90px]`, `min-w-[75px]`, and any `flex-1`.
- Set className to `w-full max-w-full` plus all existing visual classes (`h-8`, `text-xs`, `bg-muted/50`, `cursor-default`, `font-mono`, `border-blue-500` when `price_changed`, etc.).

Specifically (current → new, keeping other classes):
- Internal SKU `<Input>`: `text-xs bg-muted/50 cursor-default font-mono h-8` → `text-xs bg-muted/50 cursor-default font-mono h-8 w-full max-w-full`
- Purch. UOM `<Input>`: `text-xs bg-muted/50 cursor-default h-8` → `… h-8 w-full max-w-full`
- Purch. Qty `<Input>`: `text-xs h-8 w-full` → `text-xs h-8 w-full max-w-full`
- Stock UOM `<Input>`: `text-xs bg-muted/50 cursor-default h-8` → `… w-full max-w-full`
- Stock Qty `<Input>`: keep `text-xs bg-muted/50 cursor-default h-8 font-mono w-full` + add `max-w-full`
- Purch. Cost `<Input>`: `text-xs h-8 w-full ${price_changed ? "border-blue-500" : ""}` → `text-xs h-8 w-full max-w-full …`
- Discount `<Input>` and Total `<Input>` (lines 1572+): strip any min-w and ensure `w-full max-w-full`.

## Untouched
- Internal Name + External Name `<th>`/`<td>` content, widths, autocomplete, multiline behavior
- `#` drag handle column
- Status / Action / delete columns
- Row classes for unmatched / sku_mismatch / price_changed (red / amber / blue left borders)
- PM hint span, Unmatched badge, drag/drop handlers, Add Line button, footer totals
- All colors, borders, fonts, row heights, business logic

## Verification
Open Procurement → Invoices → edit modal at 1184px viewport (current preview): fixed columns render at exact ch widths, name columns look identical, table scrolls horizontally instead of crushing, warning row (amber) and PM hint still display correctly.

Switch to build mode to apply.
