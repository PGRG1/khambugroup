## Goal

Make `hr_payroll` records flow into the general ledger automatically — same pattern as Sales and Invoices — so payroll appears in **P&L** (Salaries Expense, MPF Expense), **Balance Sheet** (Salary Payable, MPF Payable, Cash), **Cashflow** (when paid), and the new **AP page** (Salary Payable + MPF Payable as payables).

## What you'll see in the app

### 1. Payroll auto-posts when a row is "approved"
Payroll rows have two payment milestones already on the table:
- `net_salary_payment_date` + `payment_method` — when staff get paid
- `mpf_payment_date` — when MPF is remitted

The ledger rebuild will generate **up to 3 entries per employee per month**:

```text
Entry A (always, on the last day of the payroll month):
  Dr  6010 Salaries Expense        gross_salary
  Dr  6020 MPF Expense             mpf_employer
      Cr  2040 Salary Payable          net_salary
      Cr  2030 MPF Payable             mpf_employee + mpf_employer
      Cr  <other deduction accounts>   other_deductions  (if mapped)

Entry B (only if net_salary_payment_date is set):
  Dr  2040 Salary Payable          net_salary
      Cr  <Cash account for payment_method>   net_salary

Entry C (only if mpf_payment_date is set):
  Dr  2030 MPF Payable             mpf_employee + mpf_employer
      Cr  <Cash account for MPF>            total
```

Result:
- **P&L**: `6010` and `6020` light up as monthly OpEx, broken down by venue (`hr_employees.venue`).
- **Balance Sheet**: `2040 Salary Payable` and `2030 MPF Payable` show what's still owed at month-end.
- **AP page**: salary + MPF payables appear as outstanding obligations until paid.
- **Cashflow**: cash outflows appear on the actual payment dates, not the accrual date.

### 2. Payroll mapping matrix (new tab in Finance → Mapping)
A small matrix lets you confirm/override:
- Salary Expense account (default `6010`, can split per venue)
- MPF Expense account (default `6020`)
- Salary Payable account (default `2040`)
- MPF Payable account (default `2030`)
- Per `payment_method` → cash account (bank_transfer, cash, cheque) — reuses the existing `payment_method_cash` rule type already used by AP payments.
- Optional: deduction accounts (e.g. "other deductions" → a specific liability or expense reduction).

### 3. Trigger
The existing **Rebuild Journal from Operations** button on the Journal page will also pick up payroll. No new button needed; payroll is just another section of the rebuild function.

## Data sources (no schema changes)

Everything derives from existing tables:
- `hr_payroll` — accruals, deductions, payment dates
- `hr_employees.venue` — for per-venue P&L attribution
- `chart_of_accounts` — already has `6010`, `6020`, `2030`, `2040`
- `account_mapping_rules` — new `rule_type` values (`payroll_salary_expense`, `payroll_mpf_expense`, `payroll_salary_payable`, `payroll_mpf_payable`); reuses existing `payment_method_cash` for the cash side.

## Edge cases handled

- **Forecast vs actual**: only post `actual_*` if present; otherwise skip (don't accrue forecasts into the GL).
- **Unpaid net salary**: posts the accrual but no cash entry — payable stays open in AP.
- **Partial month / mid-month hire**: uses `gross_salary` / `net_salary` as-is (already calculated in the row).
- **MPF paid before net salary** (or vice versa): two independent entries on their own dates.
- **Voiding/republishing**: rebuild deletes all non-manual entries first (existing behavior), so re-running is idempotent.
- **Missing mapping**: row is skipped and a count is returned, mirroring how unmapped invoice lines are skipped today.

## Technical details

**Modified files:**
- `supabase/migrations/<new>.sql` — extend `rebuild_journal_from_operations()` to add a payroll section after the invoice/payment section. Also seed default `account_mapping_rules` for the four payroll types if not present.
- `src/components/finance/PayrollMappingMatrix.tsx` (new) — small matrix UI (one column, four rows + payment-method rows).
- `src/pages/finance/AccountMapping.tsx` (or wherever the existing mapping tabs live) — register the new tab.
- `src/hooks/usePayables.ts` — extend to also surface `2030` and `2040` balances as "Payroll-related payables" alongside supplier invoices, so the AP page is complete.

**No changes to:**
- `hr_payroll` schema.
- `journal_entries` / `journal_lines` schema.
- The Journal UI (rebuild button already exists).

**Mapping rule keys:**
- `payroll_salary_expense` — match_key = `''` (global) or venue name (override).
- `payroll_mpf_expense` — same pattern.
- `payroll_salary_payable` — global.
- `payroll_mpf_payable` — global.
- `payment_method_cash` — already exists; reused for net_salary / MPF cash side.

**Source IDs** for traceability:
- Accrual entry: `source_type='payroll_accrual'`, `source_id=hr_payroll.id`.
- Net salary payment: `source_type='payroll_net_payment'`, `source_id=hr_payroll.id`.
- MPF payment: `source_type='payroll_mpf_payment'`, `source_id=hr_payroll.id`.

## Out of scope (flag for later)

- Per-employee sub-ledger (current plan rolls up by venue; if you want per-person P&L, that's a separate report).
- Auto-reversing accruals across fiscal year boundaries.
- Loan/advance accounts for staff (would need a new AR-style table).
- Statutory reports (IR56, MPF schedules) — the GL data will be there, but formatted government reports are a separate module.
