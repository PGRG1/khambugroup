## Audit result for `src/components/procurement/ProcurementInvoicesTab.tsx`

All checks pass. No fixes required.

| Check | Status |
|---|---|
| `STATUSES`, `STATUS_BADGE`, `statusFilter`, `setStatusFilter` fully removed | ✅ Gone (only `REVIEW_STATUSES` remains, which is unrelated) |
| `STATUS_COLORS` retained (line 52) | ✅ Present |
| `updateInvoiceStatus` retained (line 188) | ✅ Present |
| Mark Paid / Mark Unpaid buttons retained (lines 1800, 1802) | ✅ Present |
| `editForm.status` retained (lines 997–1069, edit dialog Select) | ✅ Present |
| `filtered` useMemo no longer references `statusFilter` | ✅ Confirmed |
| `InvoiceTableSectionProps` / `InvoiceTableSection` signature free of status filter props | ✅ Confirmed |
| `invoiceVarianceMap[inv.id]` GRN variance badge rendered inside Invoice # `<TableCell>` | ✅ Present at line 2110, inside the Invoice # cell, immediately after `{inv.invoice_number}` |

No build, runtime, or lint issues introduced by the previous edit. Nothing to change.
