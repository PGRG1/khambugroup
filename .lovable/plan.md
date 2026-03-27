

## Fix: Duplicate flag not updating when invoice number changes

### Problem
The duplicate check runs only once after scanning. When the user edits the invoice number field, `updateField` updates the value but never re-runs `checkDuplicates`. The "Cannot be recorded" banner stays stuck even after changing the invoice number.

### Solution
After updating `invoice_number` or `supplier_id`, re-run the duplicate check for the current invoice and clear/set the flag accordingly.

### Changes

**File: `src/components/invoices/InvoiceScanner.tsx`**

1. Modify `updateField` (line ~488): After setting the new value, if the changed field is `invoice_number`, trigger a re-check of the duplicate status for the current invoice. Clear `is_duplicate` immediately, then query the database with the new invoice number + supplier_id combo. If a match is found, re-set the flag; otherwise leave it cleared.

2. Similarly in `handleSupplierChange` (line ~496): After updating the supplier, re-check duplicate status since duplicates are keyed on invoice_number + supplier_id.

3. Extract a single-invoice duplicate check helper to avoid duplicating logic:
   ```text
   recheckDuplicate(idx, invoiceNumber, supplierId)
     -> query DB for matching invoice
     -> update is_duplicate / duplicate_date on that index
   ```

This ensures the duplicate banner updates in real-time as the user edits the invoice number or supplier fields.

