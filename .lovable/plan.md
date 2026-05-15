# Payroll Accrual & Payment Settlement — Plan

Split today's single "Post to Ledger" button into two clear steps: **Post Payroll Accrual** (month-end booking) and **Record Payroll Payment** (settle salary or MPF payable). Keep employee-level settlement detail even though the GL entry is summarised.

## 1. Data model

New tables (migration):

- `hr_payroll_payment_batches`
  - `period_year`, `period_month`, `payment_kind` (`salary` | `mpf`)
  - `payment_date`, `payment_method` (`bank_transfer` | `cash` | `other`)
  - `bank_account_id` (nullable, for bank_transfer)
  - `total_amount`, `status` (`draft` | `posted` | `void`)
  - `journal_entry_id` (created when posted)
  - `bank_transaction_id` (set when reconciled)
  - `notes`, `created_by`
- `hr_payroll_payment_batch_lines`
  - `batch_id`, `payroll_id`, `employee_id`, `amount`, `kind` (`salary` | `mpf`)

Add to `hr_payroll`:
- `accrual_journal_entry_id uuid`
- `salary_paid_amount numeric default 0`
- `mpf_paid_amount numeric default 0`
- Derived `salary_payment_status` and `mpf_payment_status`: `unpaid` / `partial` / `paid` (computed in the UI from amounts).

RLS: admin/manager read; admin write. Triggers update `hr_payroll.salary_paid_amount` / `mpf_paid_amount` when batch lines change and the batch is `posted`.

## 2. Payroll Accrual posting

New RPC `post_payroll_accrual(p_year int, p_month int)`:

- Admin-only; raises if `(year, month)` already has a posted accrual entry whose `manually_adjusted = false`.
- Date = last day of selected month (e.g. `2026-04-30`).
- One **summarised** journal per venue (or one global if no venue mapping) with `source_type = 'payroll_accrual'`, `source_id = '{year}-{month}'` (or `…|venue`):
  - Dr Salaries Expense (mapped per venue, fallback global)
  - Dr Employer MPF Expense
  - Cr Salary Payable (2110 / mapped)
  - Cr MPF Payable (2120 / mapped)
- Stamps `hr_payroll.accrual_journal_entry_id` for every employee row in that month so we can detect duplicates and link back.
- Removes the payroll branch from `rebuild_journal_from_operations` so rebuild never re-creates accruals (they become first-class manual-RPC entries, similar to invoices but locked to one month).

Idempotency: if any `hr_payroll` row in `(year, month)` already has `accrual_journal_entry_id`, RPC returns `{ already_posted: true }` and does nothing. A separate `rebuild_payroll_accrual(year, month)` admin action voids the prior entry, clears the link, and re-posts.

## 3. Payroll Payment posting

New RPC `post_payroll_payment_batch(p_batch_id uuid)`:

- Validates batch is `draft`, lines exist, total matches sum.
- For `payment_kind = 'salary'`:
  - Dr Salary Payable (total)
  - Cr Bank (if bank_transfer, from `bank_account_id.linked_gl_account_id`) **or** Cr Cash on Hand (if cash) **or** Cr mapped "other" account
- For `payment_kind = 'mpf'`: same shape against MPF Payable.
- Sets `journal_entries.source_type = 'payroll_payment'` (or `'mpf_payment'`), `source_id = batch_id`.
- Updates `hr_payroll.salary_paid_amount` / `mpf_paid_amount` from batch lines.
- Marks batch `status = 'posted'`, stores `journal_entry_id`.

Voiding a batch: void the JE, subtract amounts, reset batch to `void`.

## 4. Bank reconciliation match

`bank_transactions.matched_source_type` already supports new sources. Add `'payroll_payment_batch'` as a matchable source:

- In bank-rec UI / matching logic, surface unsettled `hr_payroll_payment_batches` where `payment_method = 'bank_transfer'` and `bank_transaction_id IS NULL`.
- On match, set `hr_payroll_payment_batches.bank_transaction_id` and `bank_transactions.journal_entry_id = batch.journal_entry_id` (the payment JE, **not** the accrual JE).

## 5. UI changes — `src/components/hr/PayrollTab.tsx`

Replace single "Post to Ledger" button with a toolbar group for the selected month:

```text
[ Save All ]   [ Post Accrual ]   [ Record Payment ▾ ]   [ Status: Apr 2026 — Accrued · Salary 60% paid · MPF unpaid ]
```

- **Post Accrual**: calls `post_payroll_accrual`. If already posted, shows toast "April 2026 payroll accrual already posted" with a small "Rebuild" link (admin only) calling `rebuild_payroll_accrual`.
- **Record Payment** opens a dialog (`PayrollPaymentDialog.tsx`):
  - Tabs: `Salary` | `MPF`.
  - Employee multi-select (defaults to all unpaid employees in the period; shows outstanding amount per employee).
  - Method: Bank Transfer / Cash / Other; if Bank Transfer → bank account dropdown (`bank_accounts` with `linked_gl_account_id`).
  - Payment date.
  - "Create & Post" → inserts batch + lines, calls `post_payroll_payment_batch`.

Per-row indicators in the payroll table:
- New columns: `Salary Paid` (badge: Unpaid / Partial / Paid) and `MPF Paid` (same), plus payment account / batch shown on hover.

A small "Payment Batches" panel under the table lists batches for the period with status, amount, linked JE, linked bank txn — clickable to view/void.

## 6. Files touched

- **DB migration** — new tables, columns, RPCs (`post_payroll_accrual`, `rebuild_payroll_accrual`, `post_payroll_payment_batch`, `void_payroll_payment_batch`), and removal of payroll block from `rebuild_journal_from_operations`.
- `src/hooks/useHRData.ts` — extend `HRPayroll` interface, add hooks for batches.
- `src/hooks/usePayrollPaymentBatches.ts` — new (list/create/post/void).
- `src/components/hr/PayrollTab.tsx` — toolbar split, status badges, batches panel.
- `src/components/hr/PayrollPaymentDialog.tsx` — new.
- Bank-rec matching: `src/hooks/useBankReconciliation.ts` and `src/components/finance/bank-recon/TransactionReviewPanel.tsx` — add `payroll_payment_batch` as a match source.
- `src/integrations/supabase/types.ts` — auto-regenerated after migration.

## 7. Out of scope

- Partial-amount payment per employee (each batch line settles full outstanding by default; user can edit amount in the dialog if needed).
- Multi-currency, FX, garnishments.
- Auto-creation of payment batches from bank transactions (matching is one-direction: existing batch ↔ existing bank txn).
