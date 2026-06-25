# Rewrite Invoice Detail Side Panel

Single file change: `src/components/procurement/ProcurementInvoicesTab.tsx`, lines ~1770–1906 only. No other components or logic touched.

## 1. Sheet width
Change `sm:max-w-lg` → `sm:max-w-2xl` on `SheetContent`.

## 2. New panel layout (top → bottom)
1. **SheetTitle**: `Invoice {invoice_number}` with the existing `review_status` badge rendered inline next to it (reuse the same badge styling used in the invoice table row).
2. **Action row** (single flex row, gap-2):
   - `Edit Invoice` — outline, primary tone (existing `startEditing`)
   - `View Attachments (N pages)` — outline, only when `selectedInvoice.file_url` exists
   - Spacer / `ml-auto`
   - `Delete` — small ghost button with destructive text/icon (not a filled red button)
3. **Meta grid** — unchanged 2-col grid (Supplier, Venue, Date, Due, Total, ID).
4. **Verified / Approved timestamps** — unchanged, only when present.
5. **Notes** — unchanged, only when present.
6. **BaniScanSummary** — moved here, rendered exactly as-is.
7. **Unified Line Items + GRN table** (replaces the two existing tables).

## 3. Unified table
- Build `giByLine` map keyed by `invoice_line_item_id` (same as today).
- `hasGrn = grnItemsForInvoice.length > 0`.
- Columns:
  - Always: **Item**, **Qty**, **Unit Price**, **Total**
  - When `hasGrn`: also **Recv Qty**, **Variance**, **Recv Total**
- For rows with no matching GRN entry, render `—` in the three GRN columns.
- Variance cell: `✓` emerald icon when zero; amber badge for negative; red badge for positive (existing logic).
- Footer (only when `hasGrn`), each total aligned under its own column:
  - Row 1 — label spans Item..Unit Price (`colSpan={3}`), **Invoiced total** value under **Total**, empty cells under Recv Qty/Variance/Recv Total.
  - Row 2 — label `colSpan={3}`, empty Total + Recv Qty + Variance, **Received total** under **Recv Total**.
  - Row 3 — label `colSpan={3}`, empty Total + Recv Qty + Variance, **Difference** under **Recv Total**, coloured `text-red-400` if negative, `text-emerald-400` if zero (positive uses default).

## 4. Table styling
- `<table className="table-fixed w-full text-xs">`
- `<colgroup>` widths:
  - No-GRN mode: 70% / 10% / 10% / 10%
  - GRN mode: Item `w-[45%]`, Qty `w-[8%]`, Unit Price `w-[12%]`, Total `w-[12%]`, Recv Qty `w-[8%]`, Variance `w-[8%]`, Recv Total `w-[12%]`
- `<thead className="bg-muted/40">` with all column headers.
- Body rows: alternating `bg-muted/30` on even rows.
- All numeric cells: `text-right tabular-nums`.

## 5. Out of scope
Do not touch the edit form (`editing` branch), invoice list table, `BaniScanSummary` internals, hooks, or data fetching.
