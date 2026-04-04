

## Add Workflow Buttons to Procurement Invoices Tab Drawer

The approval workflow buttons (Verify, Approve, Revert to Pending, Mark Paid) and verification/approval metadata were only added to the standalone **Invoices** page drawer — they're missing from the **Procurement > Invoices** tab drawer.

### Change: `src/components/procurement/ProcurementInvoicesTab.tsx` (lines ~905–943)

Add to the detail drawer, after the "Edit Invoice" button and info grid:

1. **Metadata display** — Show "Verified: [timestamp]" and "Approved: [timestamp]" when available (same as Invoices.tsx lines 900-905)

2. **Workflow action buttons** — Context-aware buttons based on current status:
   - `pending` → "✓ Verify" button
   - `verified` → "✓ Approve" + "Revert to Pending" buttons
   - `approved` → "Mark Paid" button
   - Always show "Mark Overdue", "Cancel", and "Delete" options

3. These buttons call `updateInvoiceStatus` with the appropriate metadata (`verified_by`, `verified_at`, `approved_by`, `approved_at` from the current `user`), then close the drawer — identical behavior to `Invoices.tsx`.

### Single file change
- `src/components/procurement/ProcurementInvoicesTab.tsx`

