Apply the 12 specified edits to `src/components/procurement/ProcurementInvoicesTab.tsx` to remove the Payment Status column from the Invoices table:

1. Delete `STATUSES` constant
2. Delete `STATUS_BADGE` constant (keep `STATUS_COLORS`)
3. Remove `statusFilter` state
4. Remove statusFilter condition + dep from `filtered` useMemo
5. Remove `status` entry from columns array
6. Remove `statusFilter`/`setStatusFilter` props passed to `<InvoiceTableSection>`
7. Remove `status` from CSV download mapping
8. Remove from `InvoiceTableSectionProps` interface
9. Remove from destructured function params
10. Remove status entry from `filterFields`
11. Remove `setStatusFilter("all")` from resetFilters chain
12. Delete Payment Status `<TableCell>`; move the `invoiceVarianceMap[inv.id]` GRN variance badge into the Invoice # cell after the invoice number

Keep: `STATUS_COLORS`, `updateInvoiceStatus`, Mark Paid/Unpaid buttons in detail Sheet, `status` field in editForm/startEditing, and all other filters.