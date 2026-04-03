

## Implement Two-Step Invoice Approval Workflow

### What changes

The invoice status flow becomes: **Pending → Verified → Approved** (plus existing Paid/Overdue/Cancelled). Any authenticated user with edit/admin access can verify and approve. Approval is a status change only — invoices remain editable after approval.

### 1. Update STATUS_COLORS and status labels

**Files: `src/pages/Invoices.tsx`, `src/components/procurement/ProcurementInvoicesTab.tsx`**

Add two new statuses to `STATUS_COLORS`:
- `verified` — blue/indigo styling (e.g. `bg-indigo-100 text-indigo-800 border-indigo-300`)
- `approved` — green styling (e.g. `bg-emerald-100 text-emerald-800 border-emerald-300`)

Keep existing statuses (pending, paid, overdue, cancelled).

### 2. Update Invoice detail drawer actions

**File: `src/pages/Invoices.tsx`** (lines ~900-905)

Replace the current action buttons with a workflow-aware set:
- **Pending** invoice → show "Verify" button
- **Verified** invoice → show "Approve" button + "Revert to Pending" option
- **Approved** invoice → show "Mark Paid" button
- Always show "Mark Overdue", "Cancel", and "Delete" options regardless of step

### 3. Update the scanner default status

**File: `src/pages/Invoices.tsx`** (line ~499)

New invoices from the scanner already save as `status: "pending"` — no change needed.

### 4. Update the Procurement Invoices tab

**File: `src/components/procurement/ProcurementInvoicesTab.tsx`**

- Add `verified` and `approved` to the status filter dropdown
- Update the detail drawer to show the same workflow buttons

### 5. Add status filter options

Both `Invoices.tsx` and `ProcurementInvoicesTab.tsx` currently have status filter dropdowns — add "Verified" and "Approved" as filter options.

### 6. Add verified/approved metadata columns to invoices table

**Database migration:**
```sql
ALTER TABLE public.invoices 
  ADD COLUMN verified_by uuid DEFAULT NULL,
  ADD COLUMN verified_at timestamptz DEFAULT NULL,
  ADD COLUMN approved_by uuid DEFAULT NULL,
  ADD COLUMN approved_at timestamptz DEFAULT NULL;
```

This tracks who verified/approved and when. Displayed in the invoice detail drawer.

### 7. Update `useInvoiceData.ts`

- Add `verified_by`, `verified_at`, `approved_by`, `approved_at` to the `Invoice` interface
- Update `updateInvoiceStatus` to accept optional metadata (user ID, timestamp) and set the appropriate `*_by` / `*_at` fields

### Files changed
1. DB migration (4 columns)
2. `src/hooks/useInvoiceData.ts` — interface + status update logic
3. `src/pages/Invoices.tsx` — STATUS_COLORS, filter options, detail drawer buttons, metadata display
4. `src/components/procurement/ProcurementInvoicesTab.tsx` — same updates

### No other changes needed
- No new RLS policies (existing update policy covers these columns)
- No new dependencies

