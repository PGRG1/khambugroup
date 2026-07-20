# Payroll → Journal Posting: Current Logic & Proposed Minimal Change

## 1. Current accrual posting logic

**`rebuild_payroll_accrual(p_year, p_month)`**
Voids all `journal_entries` referenced by `hr_payroll.accrual_journal_entry_id` for the period, clears the FK back to NULL, then calls `post_payroll_accrual`. No line-level logic of its own.

**`post_payroll_accrual(p_year, p_month)`**
- Bails out if any row already has an `accrual_journal_entry_id` for the period (returns `already_posted`).
- Accrual date = last day of the month.
- Resolves accounts from `account_mapping_rules`:
  - `salary_payable` / `mpf_payable` (global, `match_key=''`) → falls back to CoA codes `2040` / `2030`.
  - Per-venue `payroll_salary_expense` / `payroll_mpf_expense` → global default → CoA `6010` / `6020`.
  - Suspense = CoA `1900` (for rounding Δ).
- Aggregates `hr_payroll` **by venue** (from `hr_employees.venue`, `(unassigned)` bucket for blanks):

  ```sql
  gross = SUM( COALESCE(actual_total, gross_salary, 0) )
  mpf_e = SUM( COALESCE(mpf_employee, LEAST(gross*0.05, 1500)) )
  mpf_r = SUM( COALESCE(mpf_employer, LEAST(gross*0.05, 1500)) )
  ```

- Writes **one journal entry per venue** (`source_type='payroll_accrual'`, `source_id='YYYY-MM|<venue>'`) with up to four lines:

  ```text
  Dr  Salaries Expense (6010, venue)   gross          "Gross salary"
  Dr  MPF Expense      (6020, venue)   mpf_r          "MPF employer"
      Cr  Salary Payable (2040)             gross - mpf_e   "Net salary payable"
      Cr  MPF Payable   (2030)              mpf_e + mpf_r   "MPF payable"
  + Suspense Δ line if rounding imbalance ≠ 0.
  ```

- Marks entries `posted`, stamps `hr_payroll.accrual_journal_entry_id`, writes an audit-log row.

**`post_payroll_batch(p_batch_id)`** (the payment side used by `usePayrollPaymentBatches`)
Reads `hr_payroll_payment_batches` and writes a simple two-line entry:

```text
Dr  Salary Payable  OR  MPF Payable     b.total_amount   "Payroll liability cleared"
    Cr  Bank / Cash                     b.total_amount   "Bank outflow"
```

Bank account resolved from `bank_accounts.linked_gl_account_id`, else `payment_method_cash|<method>` mapping. Also updates `bank_transactions` if matched.

*(There is also an older `post_payroll_payment_batch` variant with the same shape — same payable→cash pair, `total = SUM(hr_payroll_payment_batch_lines.amount)`. It never reads earnings components; it only touches the payable and cash accounts.)*

## 2. Does the accrual read AL/PH, NP, and Bonus today?

**No — not directly.** It reads exactly two amount fields per payroll row:

- `COALESCE(actual_total, gross_salary, 0)` → treated as Gross expense
- `mpf_employee`, `mpf_employer` (with a 5% / $1,500 fallback)

It does **not** reference `annual_leave_pay`, `unpaid_leave_deduction`, `actual_bonus`, `overtime_pay`, `adjustments_override`, or `other_deductions`.

**Implication for the new formula.** Journal Gross will match payslip Gross **only if** the app-layer save of `hr_payroll` already writes the composed Gross (Base + OT + Bonus + AL/PH − NP + Adjustments) into `actual_total` or `gross_salary`. If Bonus / AL / NP live only in their own columns and the write path forgets to fold them into `actual_total`, the ledger will silently under- or over-book labor expense. This is the risk we need to close in the same change.

## 3. Proposed minimal edit (do not apply yet)

**Scope:** `post_payroll_accrual` only. `rebuild_payroll_accrual`, `post_payroll_batch`, and `post_payroll_payment_batch` stay untouched — the payment side works off `total_amount` / batch-line sums, which are independent of Gross composition.

**A. Compute Gross from components inside the SQL aggregation** so the ledger no longer depends on the app populating `actual_total` correctly. Replace the aggregation with:

```sql
gross = SUM(
  COALESCE(p.forecast_base_salary, p.base_salary, 0)
+ COALESCE(p.overtime_pay, 0)
+ COALESCE(p.actual_bonus, 0)
+ COALESCE(p.annual_leave_pay, 0)
- COALESCE(p.unpaid_leave_deduction, 0)
+ COALESCE(p.adjustments_override, 0)
)
```

Keep MPF aggregation as-is (respecting overrides where already resolved on the row).

**B. Keep the same 4-line entry shape** — AL/PH and Bonus flow into the existing Salaries Expense debit, NP reduces it. No new GL accounts, no new mappings, no per-component breakout lines. Memo on the debit line stays `"Gross salary"` (single line preserves current reporting/reconciliation views).

**C. Rounding & suspense** — unchanged. The existing Δ-to-1900 guard already covers any component-level rounding drift.

**Payment-side impact check.** `post_payroll_batch` / `post_payroll_payment_batch` clear `salary_payable` / `mpf_payable` by `batch.total_amount`, which is derived from `hr_payroll_payment_batch_lines.amount` (Net figures written by the app when batching). They never recompute Gross. **No change needed there**, provided the app continues to write batch-line amounts equal to (Gross − MPF EE − Other Deductions). Flagging: if the app currently derives batch-line amounts from `net_salary`, confirm `net_salary` is recomputed under the new formula before this change ships — otherwise Net paid ≠ payable cleared.

**Migration note.** Because the change lives entirely inside `post_payroll_accrual`, existing posted entries are unaffected. To realign historical months, users run the existing "Rebuild from operations" (`rebuild_payroll_accrual`) per period — it voids and reposts using the new formula.

## Deliverable of the follow-up build
One `CREATE OR REPLACE FUNCTION public.post_payroll_accrual(...)` migration containing only the aggregation-expression change described in §3A. No schema changes, no mapping-rule changes, no UI changes.