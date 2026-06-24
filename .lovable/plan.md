Apply the 15 edits exactly as specified in the user's prompt to `src/components/procurement/ProcurementInvoicesTab.tsx` to bring the Edit Invoice view to feature parity with the Invoice Scanner.

### Scope (single file)
`src/components/procurement/ProcurementInvoicesTab.tsx`

### Changes
1. **Imports** — add `LineStatusChip`, `getLineStatus` from `@/components/invoices/InvoiceReviewPanels` and `fetchActiveDealsForSupplier`, `findDealForProduct`, `computeMissingDeals`, `SupplierDeal` from `@/utils/supplierDeals`.
2. **Model** — extend `EditableInvoiceLine` with `deal_id: string | null`; default in `emptyEditLine`; hydrate in `hydrateEditLine`.
3. **Deal state** — add `activeDeals` state and a `useEffect` that loads active deals for the current supplier when editing.
4. **Missing deals** — add `missingDeals` `useMemo` computed from `activeDeals` + current edit lines.
5. **Persistence** — include `deal_id` in `mappedLines` inside `handleSaveEdit`.
6. **Deal detection on edit** — in `updateEditLine`'s `unit_price` branch, set/clear `deal_id` based on free-unit status; in `selectEditProduct`, set `deal_id` when picked product is a free-unit line.
7. **Header form** — add a Status `Select` (Outstanding / Unpaid / Paid / Overdue / Under Review / Disputed / Cancelled) as the 4th field; expand grid from `xl:grid-cols-4` to `xl:grid-cols-5`; show a "status auto-set to Disputed" hint when `editDisputeStats.hasDispute`.
8. **Missing-deal banners** — render warnings above the Line Items heading using `missingDeals`.
9. **Line table** — add `Status` and `Action` headers and matching cells per row: status chip via `getLineStatus`/`LineStatusChip`; action cell with match-details tooltip or "Unmatched" badge.
10. **Acc. price cell** — for free-unit lines, show `"{buy}+{free} · {supplier}"` when a deal is linked, else "Zero — unlinked"; for normal lines with a master price, append an `Eff: $X.XX` effective-cost label when a deal is linked.

### Verification
- TypeScript build clean (no other files touched).
- Open an invoice in Edit; confirm Status select renders, deal warnings appear when expected, status chips and action tooltips show per row, free-unit rows display deal label, and saving persists `deal_id`.
