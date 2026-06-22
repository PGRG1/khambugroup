## Goal

Replace the single ambiguous **Total** column in both the Invoice Scanner and the Edit Invoice view with two explicit, read-only columns: **Invoiced Amount** and **Accepted Amount**. Update footer totals to match. No other behaviour changes.

## Files to change

1. `src/components/invoices/InvoiceScanner.tsx` — scanner line-item table (header at line 1531, cell at lines 1795–1803, footer at lines 1863–1911).
2. `src/components/procurement/ProcurementInvoicesTab.tsx` — edit-invoice line-item table (header at line 948, Total cell at line 1098–1100, footer at lines 1119–1148).

No other component is touched. DB schema, save logic, rounding modes, status auto-flip, row tinting, discount/tax/reason/note/diff columns all unchanged.

## Per-row changes (both files)

Remove the single `Total` column. Insert two columns in its place, both **read-only**:

- **Invoiced Amount** — `Purch. Qty × Purch. Cost`, muted (`text-muted-foreground`), currency 2dp. Recomputed on the fly; never editable.
- **Accepted Amount** — `Accepted Qty × Purch. Cost`, currency 2dp. Colour:
  - equal to invoiced → normal (`text-foreground`)
  - less → red (`text-red-400` / destructive)
  - greater → green (`text-emerald-400` / success)

Notes:
- In the **Scanner**, the existing Total cell is currently an editable `<Input>` (`total_override`). Per the spec ("Always read-only"), that override is removed from the UI. The `total` value persisted to `invoice_line_items.total` continues to be computed as before in the save path (still `qty × price − discount + tax` via `formatLineTotal`), so the DB column keeps storing the invoiced amount. No save-logic edits.
- In the **Editor**, the existing Total cell is already read-only — straight replacement.

## Footer changes (both files)

Replace the current single-Total footer block with:

- **Invoiced subtotal** — sum of `quantity × unit_price` across all lines. Muted.
- **Accepted subtotal** — sum of `accepted_qty × unit_price`. Coloured vs invoiced subtotal (normal / red / green), same rules as the cell.
- **Disputed** — `invoiced − accepted`, shown only when non-zero, always red, prefixed `−` for shortfall and `+` for over-delivery.
- **Doc total** (scanner only, existing AI doc total line) — unchanged.

The existing **Discount** input and **Subtotal/Tax** rows remain untouched; the new three rows replace only the old `Total:` line. (Keeping Subtotal/Tax/Discount preserves accounting display and the mismatch warning vs AI doc total.)

## Out of scope

- DB schema: no migration. `invoice_line_items.total` continues to store invoiced amount.
- GRN auto-generation, save logic, rounding, status flip, row tints, all other columns: untouched.
- Other invoice views (list page, detail modal, analytics): untouched.

## Verification

After edits, open Procurement → Invoices, scan/open an invoice, change an Accepted Qty on a line, and confirm:
- Invoiced Amount stays muted and constant.
- Accepted Amount recolours (red/green) and footer Disputed row appears with correct sign.
- Saving the invoice still writes the same `total` value to `invoice_line_items` (spot-check via the existing flow).
