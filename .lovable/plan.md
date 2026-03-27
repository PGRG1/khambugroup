

## Fix: Stop auto-creating suppliers during invoice scanning

### Problem
The `matchOrCreateSupplier` function in `InvoiceScanner.tsx` (line 201-221) automatically creates a new supplier record when the scanned supplier name doesn't match any existing supplier. This caused a duplicate "匯泉國際有限公司 TELFORD INTERNATIONAL COMPANY LIMITED" entry because the OCR returned the full Chinese+English name which didn't match the existing "Telford International Company" via the partial matching logic.

The supplier list should only ever be modified manually through the Suppliers tab.

### Solution
Remove the auto-create behavior. When no match is found, return an empty string (unmatched) so the user can manually select the correct supplier from the dropdown.

### Changes

**File: `src/components/invoices/InvoiceScanner.tsx`**

1. In `matchOrCreateSupplier` (lines 214-220): Remove the `batchCreatedSuppliers` logic and the `onCreateSupplier` call. When no match is found, simply return `""` (empty/unmatched). The user will then manually pick the correct supplier from the dropdown during reconciliation.

2. Remove the `batchCreatedSuppliers` ref (line 199) since it's no longer needed.

3. Rename function to `matchSupplier` to reflect it no longer creates.

**File: `src/components/procurement/ProcurementInvoicesTab.tsx`**

4. Line ~504: Remove the `createSupplier` call in the supplier select's `pm:` prefix handler that also auto-creates suppliers. Instead, this code path should be removed or replaced with a toast telling the user to add suppliers via the Suppliers tab.

### Result
Scanning will still attempt to match supplier names to existing records. Unmatched suppliers will show as blank in the scanned invoice, requiring manual selection from the dropdown. No new supplier records will ever be created automatically.

