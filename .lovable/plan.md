# Fix invoice deal pricing and subtotal reconciliation

## Confirmed problem

- The scanner currently classifies a line as a free deal unit primarily from `unit_price === 0` plus a positive quantity. A failed or missing price extraction can therefore be mislabeled as a deal.
- The “Zero — unlinked” state in the screenshot means the row has no verified supplier deal. It should not be silently accepted as a valid free unit.
- Setting purchase cost to zero is valid only when the source invoice genuinely shows a free line. Deal detection must never overwrite or infer the invoice price solely from a zero value.
- Accepted amount and subtotal formulas are repeated in the scan review and saved-invoice editor. Although the earlier phantom master-price contribution was patched, duplicated formulas leave the two paths vulnerable to diverging again.

## Changes

1. **Make free-unit detection evidence-based**
   - Preserve the scanned purchase cost exactly as extracted or manually entered.
   - Mark a row as a confirmed deal line only when it has a matching active supplier deal and the invoice contains the corresponding paid product quantity.
   - Treat a zero-priced row without that evidence as an unresolved price, not a deal; show it as a blocking review issue instead of “Zero — unlinked.”
   - Re-evaluate the deal state when supplier, product link, quantity, or purchase cost changes.

2. **Centralize invoice and accepted amount math**
   - Add one shared calculation utility used by both `InvoiceScanner.tsx` and `ProcurementInvoicesTab.tsx`.
   - Confirmed free units contribute exactly `0` to both invoiced and accepted subtotals, regardless of the product-master price.
   - Paid lines use invoice price for invoiced value and accepted price/quantity for accepted value, with discounts and supplier rounding applied consistently.
   - Use rounded currency values when comparing subtotals so harmless floating-point residue never creates a dispute.

3. **Clarify the review UI**
   - Keep `0` visible in Purchase Cost for a verified free unit and identify the linked deal.
   - Replace “Zero — unlinked” with an explicit unresolved-price warning and require correction or verified deal linkage before approval.
   - Ensure the row amount, footer subtotal, dispute indicator, and document reconciliation all use the same calculation result.

4. **Protect saved data**
   - Persist `is_free_unit_line` and `deal_id` only for verified deal rows.
   - Do not alter existing product-master purchase cost when processing a free unit.
   - Apply the same validation when editing an already saved invoice.

5. **Regression coverage**
   - Test a valid buy-X-get-Y-free invoice: free row remains zero and both subtotals match.
   - Test an OCR-missed price: zero unlinked row blocks approval and is not classified as a deal.
   - Test a free row whose product master has a non-zero cost: master cost never enters accepted subtotal.
   - Test discounts, accepted-quantity differences, supplier rounding modes, and scan/editor parity.

## Scope

Frontend calculation, validation, and tests only. No changes to accounting postings, product-master prices, or existing invoice balances.