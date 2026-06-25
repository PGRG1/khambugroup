Edit only `src/components/procurement/ProcurementInvoicesTab.tsx`:

1. **Table row Status cell** — replace the `<Select>` bound to `review_status` with a read-only badge using `REVIEW_BADGE[rs]`, falling back to muted styling.

2. **Edit header grid** — remove the Status `<div>` block (Select with Outstanding/Unpaid/Paid/Overdue/Under Review/Disputed/Cancelled) and the adjacent dispute hint `<div>`. Change grid class `xl:grid-cols-5` → `xl:grid-cols-4`.

3. **handleSaveEdit** — add to the `updateInvoice` payload:
   ```ts
   review_status: (editDisputeStats.hasDispute || editLines.some(l => l.price_disputed))
     ? "Disputed"
     : "Approved",
   ```

Keep `REVIEW_BADGE`, `REVIEW_STATUSES`, the review_status filter, and all KPI logic untouched.