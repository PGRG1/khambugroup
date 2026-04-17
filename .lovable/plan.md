

## Fix: Apply Beverage World per-line rounding to all invoice edit dialogs

### Problem
Per-line rounding for "Beverage World HK" was only added to `InvoiceScanner.tsx`. The screenshot shows `/procurement/invoices` (`ProcurementInvoicesTab.tsx`) where line totals still display `80.00`, `120.00`, `261.00`, etc. instead of whole dollars. The legacy `Invoices.tsx` edit dialog has the same gap.

### Files to edit
1. `src/components/procurement/ProcurementInvoicesTab.tsx`
2. `src/pages/Invoices.tsx`

### Changes

**1. `ProcurementInvoicesTab.tsx`**

- Update `calculateEditLineTotal` (line 271) to take supplier name and round to whole dollar when supplier matches "beverage world":
  ```ts
  const calculateEditLineTotal = (line, supplierName?) => {
    const raw = (qty * price) - disc + tax;
    const isBW = (supplierName || "").toLowerCase().includes("beverage world");
    return isBW ? String(Math.round(raw)) : raw.toFixed(2);
  };
  ```
- Update all callers (lines 302, 402) to pass the current supplier name (resolved via `getSupplierNameById(editForm.supplier_id || selectedInvoice?.supplier_id)`).
- Update `hydrateEditLine` (line 302) so when re-hydrating an existing line for a BW supplier, the displayed `total` is also rounded (don't keep the raw 2-decimal string verbatim — re-compute when supplier is BW).
- In `handleSaveEdit` (lines 357-385), round each line's persisted `total` for BW so the DB matches the display, then sum: `lineTotals = sum of rounded line totals`. `total_amount` becomes the sum of rounded line values.
- The `editTotal` summary (line 546) automatically reflects the rounded values since it sums `line.total`.

**2. `Invoices.tsx`**
Same pattern:
- Lines 301, 324, 414: wrap line-total computation with a helper that rounds when the invoice's supplier name includes "beverage world". Use the existing `editSupplierName` variable that's already available.
- Persisted `lineTotal` (line 324, 330) uses the rounded value for BW.

### Notes
- No DB schema changes.
- Display in the read-only invoice detail view (lines 1012-1013 in `Invoices.tsx`, line 1013 in `ProcurementInvoicesTab.tsx`) already calls `Number(...).toFixed(2)` — for BW invoices the stored `total` will already be a whole number, so it'll render as e.g. `4.00`. Optional: use `fmtForSupplier` helper (already exists at line 33-35 of `ProcurementInvoicesTab.tsx`) in those readonly cells for cleaner display without the trailing `.00`.
- Invoice-level totals (`total_amount`) follow naturally from summed rounded line totals.

