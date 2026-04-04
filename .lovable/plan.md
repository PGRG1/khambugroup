

## Remove Status Dropdown, Keep Only Workflow Buttons

The edit form currently has a Status dropdown (Select) that lets users freely pick any status — bypassing the Verify → Approve workflow. The fix is to remove that dropdown from the edit forms and rely solely on the workflow buttons.

### Changes

**1. `src/components/procurement/ProcurementInvoicesTab.tsx`** (lines 564-578)
- Remove the Status `<Select>` field from the edit form
- The status will only change via the dedicated workflow buttons (Verify, Approve, Mark Paid, etc.) in the detail drawer

**2. `src/pages/Invoices.tsx`**
- Check if there's a similar status dropdown in the edit form and remove it as well, for consistency

Both pages already have the workflow buttons in the detail drawer — those become the only way to change status.

### Single visual change
The edit form loses one field (Status dropdown). Everything else stays the same.

