## Problem

On line 1 of your screenshot: 8 × 537 = 4,296 with a 30% line discount (−1,288.80) should net 3,007.20. But the "Invoiced Amount" and "Accepted Amount" columns both still show 4,296.00, and the footer "Invoiced subtotal" / "Accepted subtotal" (6,260.00 / 6,260.00) also ignore the discounts. Only "Doc total" (4,382.00) is correct because it's computed separately.

Root cause: the amount column cells and subtotal aggregators use raw `qty × unit_price`, with no subtraction of `line_discount_amount` or `header_discount_share`. This bug exists in both `InvoiceScanner.tsx` and the Edit dialog inside `ProcurementInvoicesTab.tsx`.

## Fix

Define amounts consistently as **net of all discounts** (matches Doc total math and `net_unit_cost` already persisted):

- Line gross = `qty × unit_price`
- Line discount $ = `%` mode → `gross × rate/100`; `$` mode → `discount` field (clamped ≥ 0)
- Line net after line discount = `max(0, gross − lineDiscount)`
- Header discount $ = same rule applied to Σ(line net)
- Header share per line = proportional to line net (use `distributeHeaderDiscount` from `src/utils/invoiceRounding.ts` for consistency with save logic)
- **Invoiced Amount (per row)** = `gross − lineDiscount − headerShare`
- **Accepted Amount (per row)** = `Invoiced Amount × (accepted_qty / qty)` (0 when qty = 0)
- Color rule unchanged: green when accepted > invoiced, red when less, neutral when equal.

Subtotals: `Invoiced subtotal` = Σ row Invoiced Amount, `Accepted subtotal` = Σ row Accepted Amount, `Disputed` = invoiced − accepted. `Doc total` stays as-is.

## Files

1. `src/components/invoices/InvoiceScanner.tsx`
   - Replace the per-row Invoiced/Accepted Amount IIFEs (~lines 1887–1915) with the net-of-discount math above.
   - Replace the footer subtotal IIFE (~lines 2041–2067) to sum the same per-row net values (use `recalcAllDiscounts` once on the lines array, then map).

2. `src/components/procurement/ProcurementInvoicesTab.tsx`
   - Same change in the Edit dialog: per-row Invoiced/Accepted cells (around the matching JSX in the edit table) and the footer block at ~lines 1281–1327. Reuse the already-imported `recalcAllDiscounts` / `normalizeDiscountMode` (the header math at 1286–1302 is correct; we just need to feed the per-line net back into the row cells and the two subtotals).

No DB changes, no save-path changes (save already persists correctly via `recalcAllDiscounts`), no changes to GRN/`net_unit_cost`. Only display.

## Verification

Open invoice HKINV-2605661 in the Edit view:
- Row 1 Invoiced = 3,007.20, Accepted = 3,007.20
- Row 2 Invoiced = 1,374.80, Accepted = 1,374.80
- Invoiced subtotal = Accepted subtotal = 4,382.00 = Doc total
Then test in Scanner with a fresh scan, a `$` line discount, and a header discount, confirming subtotals match Doc total in each case.
