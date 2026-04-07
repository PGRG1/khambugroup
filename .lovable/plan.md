

## Fix: Persist "Under Review" Status When Saving Invoices

### Problem
The invoice scanner lets you select a status (e.g. "Under Review"), but when saving:
1. `doSaveCurrent` in `InvoiceScanner.tsx` never passes `invoice_status` to the `onSave` callback
2. Both save handlers in `Invoices.tsx` and `ProcurementInvoicesTab.tsx` hardcode `status: "pending"`, overriding whatever the user selected

### Fix (3 files)

**`src/components/invoices/InvoiceScanner.tsx`**
- Add `status` to the `onSave` callback type (line 85-107)
- Pass `inv.invoice_status` in the `doSaveCurrent` call to `onSave` (line 674-686)

**`src/pages/Invoices.tsx`**
- Replace hardcoded `status: "pending"` with `status: inv.status || "pending"` (line 501)

**`src/components/procurement/ProcurementInvoicesTab.tsx`**
- Same change: replace hardcoded `status: "pending"` with `status: inv.status || "pending"` (line 748)

### Result
When the user sets "Under Review" (or any status) before saving, the selected status persists to the database and displays correctly in invoice lists.

