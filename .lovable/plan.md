## Goal

Improve the existing `/finance/payables` page (do not rebuild). Only show invoices with `review_status = 'Approved'`, and turn the page into a finance control center with richer KPIs, filters, status badges, and actions. Improve the existing payment recording flow with bank-account linkage and bank-match status.

## Scope guardrails

- Keep `usePayables`, `Payables.tsx`, and the existing Mark Paid path; refactor in place.
- Procurement invoice review screens are unchanged — they still drive `review_status`.
- AP becomes the post-approval workspace.

## 1. Approved-only filter

In `usePayables.ts`, filter invoices to `review_status = 'Approved'` before computing open/summary. Drafts, Under Review, Needs Review, Rejected, Duplicate, and Voided invoices never appear in AP.

## 2. Schema changes (minimal additions)

Add to `invoices`:
- `payment_status` already exists — extend allowed values used in UI: `unpaid`, `scheduled`, `partially_paid`, `paid`, `overdue`, `credit_note_applied`, `voided`. No DB enum; remain text. Add a validation trigger (not CHECK) to restrict values.
- `scheduled_payment_date date` (nullable) — for "Scheduled".
- `bank_match_status text default 'not_ready'` — values: `not_ready`, `awaiting_bank_match`, `matched`, `possible_match`, `needs_review`. Validation trigger.

Add to `invoice_payments`:
- `bank_account_id uuid` (nullable, references `bank_accounts.id`)
- `bank_transaction_id uuid` (nullable, references `bank_transactions.id`)
- `match_status text default 'awaiting_bank_match'` — same vocabulary as above
- `reference text default ''`

Backfill: existing `paid` invoices → `bank_match_status = 'matched'` if a linked bank_transaction can be found, else `awaiting_bank_match`; unpaid → `not_ready`.

RLS: mirror existing `invoice_payments` policies on the two new columns (no policy changes needed; policies are row-level).

## 3. Hook refactor — `usePayables`

Compute and return:
- `approvedInvoices` (full list incl. paid, for "Paid This Month" and partial logic)
- `openInvoices` — approved + not fully paid + not voided
- KPIs:
  - `totalOutstanding` = Σ `remaining_balance` of open
  - `dueThisWeek` = Σ outstanding where `due_date` within next 7 days
  - `overdue` = Σ outstanding where `due_date < today`
  - `paidThisMonth` = Σ `invoice_payments.amount` in current month (already present)
  - `partiallyPaid` = count where `amount_paid > 0 AND remaining_balance > 0`
  - `awaitingBankMatch` = count of payments with `match_status in ('awaiting_bank_match','possible_match','needs_review')`
  - `unallocatedPayments` = count of `invoice_payments` rows whose invoice is fully paid? Actually: unallocated = payments with `invoice_id IS NULL` once we permit on-account payments. Phase 1 = 0 placeholder + TODO note in UI tooltip.
- Per-invoice derived fields: `outstanding_amount`, `last_payment_method`, `last_paid_from_account_name`, `bank_match_status`, derived `payment_status` (recompute `overdue` on the fly from due_date when unpaid).

## 4. UI — `src/pages/finance/Payables.tsx`

### Header
Keep current header. Add a small "Approved invoices only" hint under the subtitle.

### KPI strip (7 cards)
Replace the 4-card grid with a `grid-cols-2 md:grid-cols-4 xl:grid-cols-7` strip using existing `card-glass`:
Total Outstanding · Due This Week · Overdue · Paid This Month · Partially Paid · Awaiting Bank Match · Unallocated Payments. Each card: icon, label, value, optional accent color (amber/red/emerald). KPIs respond to active filters.

### Filter bar
Single sticky row above the table:
- Search (supplier/invoice #)
- Supplier select
- Venue select
- Payment Status select (7 values)
- Bank Match Status select (5 values)
- Due Date Range (preset + custom)
- Paid From Account select (bank accounts)
- Reset filters button

### Table (replace "Open Invoices" table; remove By Supplier and Aging tabs OR keep them as secondary tabs)

Primary view "Invoices" with columns:
Supplier · Invoice # · Venue · Invoice Date · Due Date · Invoice Amount · Outstanding Amount · Payment Status · Last Payment Method · Paid From Account · Bank Match Status · Issue · Action

- Status cells use a new `<PaymentStatusBadge>` and `<BankMatchBadge>` with semantic color tokens (emerald=paid/matched, amber=partial/possible, red=overdue/needs review, sky=scheduled, zinc=not ready/unpaid, purple=credit note).
- "Issue" cell shows `exception_note` if present, else a dash.
- Action cell = dropdown with: Record Payment · Allocate Payment · View Payment History · Open Invoice.

Keep secondary tabs "By Supplier" and "Aging Summary" as-is (compact).

### Dialogs (new, small, in `src/components/finance/payables/`)
- `RecordPaymentDialog.tsx` — date, amount (default = remaining_balance), payment method, paid-from bank account select, reference, notes. On save: insert into `invoice_payments`, recompute `amount_paid` + `remaining_balance` + `payment_status` + `bank_match_status='awaiting_bank_match'`.
- `AllocatePaymentDialog.tsx` — list unmatched bank_transactions for the invoice's window; user picks one → sets `invoice_payments.bank_transaction_id` and flips invoice `bank_match_status='matched'`.
- `PaymentHistoryDialog.tsx` — read-only list of `invoice_payments` with reverse / void action (admin only).

## 5. Status badges

Add `src/components/finance/payables/StatusBadges.tsx` with two small components driven by the project's existing `chip-*` classes. Tooltip on hover explains each status.

## 6. Out of scope (call out, don't build)

- True allocation of on-account / unallocated payments (Phase 2).
- Auto-matching engine for bank transactions (Phase 2 — relies on existing `bank_recon_rules`).
- Voiding / credit-note generation flow.

## Files

Edit:
- `src/hooks/usePayables.ts`
- `src/hooks/useInvoiceData.ts` (extend `Invoice` type + status updaters)
- `src/pages/finance/Payables.tsx`

Create:
- `src/components/finance/payables/StatusBadges.tsx`
- `src/components/finance/payables/RecordPaymentDialog.tsx`
- `src/components/finance/payables/AllocatePaymentDialog.tsx`
- `src/components/finance/payables/PaymentHistoryDialog.tsx`

Migration: add columns + validation triggers + backfill described in §2.

## Open question

Do you want me to **remove** the existing "By Supplier" and "Aging Summary" tabs, or keep them as secondary tabs alongside the new "Invoices" view?
