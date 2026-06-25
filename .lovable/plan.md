Apply the 10 specified edits to `src/components/procurement/ProcurementInvoicesTab.tsx`:

1. Update `REVIEW_STATUSES` to `["Approved", "Disputed", "Voided"]`.
2. Replace `REVIEW_BADGE` with 3-entry map (emerald / orange / zinc).
3. Add `Ban` to the existing `lucide-react` import.
4. Rename column `"Review Status"` → `"Status"`, width `w-[110px]`.
5. Replace all four `|| "Under Review"` fallbacks with `|| "Approved"` (filtered, kpis, CSV, table row).
6. In `kpis` useMemo: swap `underReview` for `voided`; drop the `rs === "Rejected"` branch from exceptions; update returned object.
7. `InvoiceKpis` interface: `underReview` → `voided`.
8. Replace "Under Review" KPI card with "Voided" using `Ban` icon and zinc tones.
9. In `filterFields`, rename `"Review Status"` → `"Status"`.
10. In the `<InvoiceScanner>` `onSave` `createInvoice` call, add `review_status: (inv as any).status === "disputed" ? "Disputed" : "Approved"`.

No other files touched.