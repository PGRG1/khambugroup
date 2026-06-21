# Recurring Expenses → Auto-generated Approval Workflow

Turn `expense_recurring_rules` into pure templates. Each period, the system generates a separate `expense_bills` row that flows through the existing Approvals → Posting → Bank-matching pipeline. No accounting impact until approved.

## 1. Schema changes (`expense_recurring_rules`)

Add:
- `status` text — `draft | active | paused | ended` (default `draft`). Backfill: `active=true` → `active`, else `paused`. Drop reliance on the boolean `active` for gating generation (keep column for back-compat read, but generator uses `status`).
- `effective_from` date — first period the rule is live. Backfill from `next_due_date`.
- `next_generation_date` date — system-calculated, read-only in UI.
- `payment_due_day` int (nullable, 1–31) — forecasting only, never drives recognition.
- `credit_account_id` uuid → `chart_of_accounts(id)` — optional override for the AP/Accrued credit side. Falls back to supplier default, then the global `accounts_payable` mapping rule.
- `auto_approve` boolean default `false` — explicit opt-in for bypassing approval.

Keep `next_due_date` column but stop using it; UI replaces the field with "Effective From".

Add to `expense_bills`:
- `source_type` text default `manual` (values: `manual | recurring_rule | bank_match`).
- `recurring_rule_id` uuid → `expense_recurring_rules(id)` ON DELETE SET NULL.
- `period_start` date, `period_end` date — accounting period covered (already have `service_period_*`; reuse those + add an index).
- `document_requirement` text default `not_required` (`not_required | pending | received`).
- Unique partial index: `(recurring_rule_id, period_start)` WHERE `recurring_rule_id IS NOT NULL` — duplicate prevention.

Approval statuses already exist (`draft|pending_review|approved|rejected|posted|void`); generator inserts `pending_review`.

## 2. Generation logic (Postgres function `generate_recurring_expense_bills()`)

For each rule where `status='active'` AND `next_generation_date <= today`:
1. Compute `period_start` / `period_end` from cadence anchored at `effective_from`.
2. Compute `bill_date` = the recognition day for that period (resolve `recognition_day='last'` → month-end; else day N capped to month length).
3. Insert one `expense_bills` row (`approval_status='pending_review'`, `source_type='recurring_rule'`, `recurring_rule_id`, venue from rule (NULL if `combined_venues`), department, vendor, total = `expected_amount`, currency, `document_requirement='not_required'`, notes prefixed with "Auto-generated from rule: {name}").
4. Insert matching `expense_bill_allocations` row using `rule.account_id` + venue + department + amount.
5. ON CONFLICT on the unique index → skip (idempotent).
6. Advance `next_generation_date` using cadence; clear nothing on `last_generated_at` (set to now()).
7. If `auto_approve=true`, immediately call the existing approve+post path.

Schedule via `pg_cron` daily at 02:00 HKT. Also expose a "Generate now" button on the Recurring Expenses page that calls the same function for admins (catch-up safe due to unique index).

## 3. Posting on approval

Existing approval already posts a journal entry. Confirm the entry uses:
- DR: allocation `account_id` (e.g. 6150 Rental Expense) per allocation row.
- CR: `rule.credit_account_id` if set, else supplier default, else `account_mapping_rules.accounts_payable`.

Update the approval-posting routine to read this credit override when the bill has `recurring_rule_id`.

## 4. Bank matching

Bank reconciliation already supports matching to `expense_bills` (FK `bank_transactions.expense_posted_bill_id` exists). Confirm/ensure:
- Matching a bank outflow to an approved recurring bill posts: DR AP/Accrued · CR Bank, and updates `paid_amount` + `payment_status` (`unpaid|partial|paid`). It does NOT create a new bill.
- Suggestion logic: when a bank txn references a vendor or amount matching an unpaid recurring bill, prefer that match.

## 5. UI changes

### Recurring Expenses page (`src/pages/expenses/RecurringExpenses.tsx`)
- Replace "Next Due Date" input → **Effective From** date.
- Show **Next Generation Date** as read-only (computed preview while editing).
- Add **Payment Due Day** (optional 1–31 select).
- Add **Status** select (`Draft / Active / Paused / Ended`) replacing the on/off toggle (toggle becomes Active↔Paused shortcut).
- Add **Credit Account** select (optional).
- Add **Auto-approve** switch (default off, with helper text).
- Table: new column "Next Generation" + status badge. Row action: "Generate now".
- Sheet helper text clarifies rule is a template.

### Approvals page (`src/pages/expenses/Approvals.tsx`)
- Extend the bill row to show: Expense name (from notes/rule name), Period, Recognition date, Venue, Department, Category, GL account, Source (`Recurring Rule` chip linking back to rule), Document status badge (`No document required` / `Document pending` / `Received`), Notes preview.
- Action buttons: Approve · Reject · **Edit & approve** (opens existing bill editor pre-filled) · **Request documents** (sets `document_requirement='pending'`, leaves status as `pending_review`) · **Mark N/A for period** (sets `approval_status='void'` with audit reason; unique index still blocks duplicates).

### Expense Bills list
- Add filter chip "Source: Recurring" and show source/rule link on each row.

## 6. Editing rule vs. generated bills

Editing an `expense_recurring_rules` row never cascades to existing `expense_bills`. Only future generations use the new values. Already true given separate-row design — add a small confirmation note in the edit sheet.

## 7. Combined-venue rule

Generator writes `venue_id=NULL`, `combined_venues=true` flag carried via a new boolean column on `expense_bills` (`combined_venues`, default false). Any later allocation between Caliente/Assembly remains a separate workflow (not in scope here).

## 8. Out of scope

- Allocation engine to split combined expenses between venues.
- Redesign of the existing approval UI beyond the new fields/buttons listed.
- Cash-flow forecast surface for `payment_due_day` (data captured; UI later).

## Technical summary

- **Migration**: alter `expense_recurring_rules` (+6 cols), alter `expense_bills` (+4 cols + unique partial index + `combined_venues` bool), create `generate_recurring_expense_bills()` SECURITY DEFINER function, schedule pg_cron job, extend approval-post function to honor `credit_account_id`.
- **Hooks**: update `useRecurringExpenses` types + save payload; add `generateNow(ruleId)` RPC wrapper. Update `useExpenseBills` to surface source fields.
- **UI**: refactor RecurringExpenses sheet/table; extend Approvals card with new metadata and 5 action buttons.
- **No changes** to: bank reconciliation core, journal balancer triggers, sales/payroll rebuild logic.
