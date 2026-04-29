## Goal

Collapse the multi-step invoice workflow (`pending → verified → approved → paid`, plus `under_review`, `overdue`, `cancelled`) down to a single binary: **Paid** vs unpaid (default, no badge). When an invoice is recorded it just exists; clicking "Mark Paid" flips it.

## Status model

- DB column `invoices.status` keeps two values only: `unpaid` (default) and `paid`.
- All other legacy values (`pending`, `verified`, `approved`, `outstanding`, `overdue`, `under_review`, `cancelled`) are migrated to `unpaid` — except invoices whose `payment_status='paid'` or `status='paid'`, which become `paid`.
- The redundant `payment_status`, `verified_by`, `verified_at`, `approved_by`, `approved_at` fields stay in the DB (no destructive drop) but the UI stops reading/writing them.

## Journal posting (the bug you saw earlier)

`rebuild_journal_from_operations` currently gates on `status='approved'`, which is why nothing posted. After this change, the gate becomes `status IN ('paid','unpaid')` — i.e. every recorded invoice posts to the ledger as soon as it exists. Payment of an invoice continues to generate the AP→Cash entry from `invoice_payments`.

## UI changes

**ProcurementInvoicesTab.tsx**
- Remove the Status filter dropdown entirely.
- Status badge: render nothing for `unpaid`; render a single subtle green "Paid" chip for `paid`.
- Remove the Status field from the edit form.
- Replace the action button cluster (Verify / Approve / Mark Paid / Mark Overdue / Cancel / Revert) with one button:
  - if `unpaid` → **"Mark Paid"**
  - if `paid` → **"Mark Unpaid"** (ghost style, for corrections)
- Default new invoices (manual + scanner) to `status='unpaid'`.

**Other touchpoints** — same simplification, no behavior beyond paid/unpaid:
- `ProcurementDashboardTab.tsx` — KPIs like "pending approval" become "unpaid".
- `InvoiceAnalytics.tsx` / `Invoices.tsx` — same.
- `DocumentsTab.tsx`, `InvoiceScanner.tsx`, `useInvoiceData.ts`, `useStandardProducts.ts`, `chat-assistant` edge function — strip references to old statuses; treat anything not `paid` as unpaid.
- `permissions.ts` — drop verify/approve action permissions if present.

## Migration

```sql
-- Normalize existing data
UPDATE invoices SET status='paid'
  WHERE status='paid' OR payment_status='paid';
UPDATE invoices SET status='unpaid'
  WHERE status NOT IN ('paid','unpaid');

ALTER TABLE invoices ALTER COLUMN status SET DEFAULT 'unpaid';

-- Update the journal builder gate
CREATE OR REPLACE FUNCTION rebuild_journal_from_operations() ...
  -- change WHERE i.status = 'approved'
  --     to WHERE i.status IN ('paid','unpaid')
```

After migration runs, hit **Rebuild Ledger** once and your ~1,022 invoices will populate Trial Balance, P&L and Balance Sheet using the COGS / OpEx / Asset mappings you set up.

## What stays

- `invoice_payments` table (records each payment) — unchanged.
- Per-product COA override and Treatment+L1 mapping — unchanged.
- Delete invoice action — unchanged.

## Out of scope

- Dropping `payment_status` / `verified_*` / `approved_*` columns. Leaving them dormant avoids breaking any historical reference and can be cleaned up later.