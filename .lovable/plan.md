Edit only `src/components/procurement/ProcurementInvoicesTab.tsx`:

1. Delete the `STATUS_COLORS` constant.
2. Remove `updateInvoiceStatus` from the `useInvoiceData` destructure.
3. In the detail Sheet, remove the "paid" Badge using `STATUS_COLORS.paid`.
4. In the detail Sheet, remove the entire Mark Paid / Mark Unpaid ternary button block.
5. Leave the `status: inv.status === "paid" ? "paid" : "unpaid"` line inside `createInvoice` untouched.