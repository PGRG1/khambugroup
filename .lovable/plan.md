Turn the Finance section into a real double-entry accounting system. Today's pages (Cashflow / Balance Sheet / Ledger / Journal) only read raw operational tables — there is no Chart of Accounts, no journal entries, no general ledger. We'll build that backbone and auto-post operational events (sales, invoices, invoice payments, payroll, manual P&L lines) into it.

## Architecture

```text
Operational events            Posting layer            Accounting core
─────────────────────         ──────────────           ──────────────────
Sales records         ─┐                              ┌─ chart_of_accounts
Invoices + payments   ─┼─►  posting rules  ─►  Journal Entries  ─►  GL lines
Payroll               ─┤    (debit/credit)            ├─ trial_balance (view)
Manual P&L lines      ─┘                              └─ derived: P&L, BS, Cashflow
```

Single source of truth = `journal_entries` + `journal_lines`. Every report (P&L, Balance Sheet, Cashflow, Ledger) is derived from these via SQL views, so totals tie out.

## Database (new tables)

1. **`chart_of_accounts`** — code, name, type (`asset|liability|equity|revenue|cogs|opex|other_income|other_expense`), normal_side (`debit|credit`), parent_id, is_active, is_cash (flag for cash/bank accounts feeding the cashflow view).
2. **`journal_entries`** — id, entry_date, memo, source_type (`sales|invoice|invoice_payment|payroll|manual|adjustment|opening`), source_id, venue, status (`draft|posted|void`), created_by, posted_at.
3. **`journal_lines`** — id, entry_id, account_id, debit, credit, venue, memo. Constraint: every entry must balance (sum debits = sum credits) — enforced via trigger.
4. **`account_mapping_rules`** — maps operational categories to COA accounts so posting is configurable: e.g. `sales→4000 Sales Revenue`, `invoice_payment.cash→1010 Cash – Bank`, `accounting_category=COGS - Wine→5010 COGS Wine`, `payroll.net_salary→6000 Salaries`, `payroll.mpf→6010 MPF`.
5. **Views**: `v_trial_balance`, `v_general_ledger`, `v_pl`, `v_balance_sheet`, `v_cash_movements` (filtered to `is_cash=true` accounts).

Seeded default Chart of Accounts (editable):
- 1000 Assets (1010 Cash – Bank, 1020 Cash on Hand, 1100 Inventory, 1200 AR)
- 2000 Liabilities (2010 AP, 2020 Tax Payable, 2030 MPF Payable, 2040 Salary Payable)
- 3000 Equity (3010 Owner Equity, 3900 Retained Earnings)
- 4000 Revenue (4010 Sales – Assembly/Caliente/Hanabi/Events, 4100 Service Charge)
- 5000 COGS (sub-accounts auto-created from existing `accounting_categories` with statement=P&L group=COGS)
- 6000 OpEx (sub-accounts from `accounting_categories` group=OpEx; plus Salaries, MPF, Rent, Utilities)

## Posting rules (auto-generated journal entries)

| Event | Debit | Credit |
|---|---|---|
| Sales record | Cash – Bank (or per payment method) | Sales Revenue (per venue) + Service Charge |
| Invoice received | COGS / OpEx (mapped via product `accounting_category`) | Accounts Payable |
| Invoice payment | Accounts Payable | Cash – Bank (per `payment_method`) |
| Payroll accrual | Salaries Expense + MPF Expense | Salary Payable + MPF Payable |
| Payroll net pay | Salary Payable | Cash – Bank |
| MPF payment | MPF Payable | Cash – Bank |
| Manual P&L line (+) | Cash | Other Income / Revenue line |
| Manual P&L line (−) | Expense line | Cash |
| Opening balance | Cash – Bank | Opening Equity |

Implementation: a single SQL function `rebuild_journal_from_operations()` (idempotent, deletes journal entries with `source_type` ≠ manual and re-creates them from current operational data). Called on demand from the UI ("Rebuild ledger") and by triggers on the source tables for incremental upserts.

## UI changes (under /finance)

1. **Chart of Accounts** (new `/finance/coa`) — full CRUD tree of accounts grouped by type, with code/name/parent/active toggle, plus an "Account Mapping" panel to bind operational categories → accounts.
2. **Journal** (`/finance/journal`) — list of journal entries with filters (date, source, venue, status); click to see balanced debit/credit lines; "New Manual Entry" form with multi-line debit/credit editor that enforces balance before save.
3. **Ledger** (`/finance/ledger`) — pick an account → ledger view (date, memo, source link, debit, credit, running balance) for the selected period, with CSV export.
4. **Trial Balance** (new `/finance/trial-balance`) — period selector → all accounts with debit/credit columns and totals.
5. **Balance Sheet** (`/finance/balance-sheet`) — proper BS as of a date: Assets / Liabilities / Equity (incl. computed Retained Earnings = sum of revenue − expenses up to date) with totals tying.
6. **P&L** — keep the existing `/pl-report` UI but add a toggle "Source: Operational | General Ledger" so it can also be derived from posted entries.
7. **Cashflow** (`/finance/cashflow`) — keep current view; switch its data source to `v_cash_movements` so it stays consistent with the GL. Opening balance editor remains.
8. **Sidebar** — Finance group becomes: P&L · Balance Sheet · Trial Balance · Journal · Ledger · Chart of Accounts · Cashflow.

## Code (new files / hooks)

- `supabase/migrations/<ts>_accounting_core.sql` — tables, balance trigger, COA seed, mapping seed, views, `rebuild_journal_from_operations()`.
- `src/hooks/useChartOfAccounts.ts`, `useJournal.ts`, `useLedger.ts`, `useTrialBalance.ts`, `useBalanceSheet.ts`.
- `src/utils/accountingFormat.ts` — money/debit-credit formatting helpers.
- `src/pages/finance/ChartOfAccounts.tsx`, `TrialBalance.tsx`; rewrite `Journal.tsx`, `Ledger.tsx`, `BalanceSheet.tsx`; refactor `Cashflow.tsx` to read from view.
- `src/components/finance/JournalEntryEditor.tsx` (multi-line debit/credit form with live balance check).
- `src/components/finance/AccountMappingPanel.tsx` (operational category → account binding).

## Security

All new tables get RLS: read for authenticated, write for `admin` or `manager` (matches existing pattern). Manual journal entries record `created_by`. Posted entries can be voided (creates reversing entry) but never hard-deleted, preserving audit trail.

## Out of scope (call out, not building now)

- Multi-currency / FX
- Bank reconciliation against statement files
- Tax filing forms
- Period close / lock with read-only historical periods (we'll ship status `posted` but not enforce period locking yet — easy to add later)

## Order of implementation

1. Migration: COA + journal tables + balance trigger + seed data + mapping table + views.
2. `rebuild_journal_from_operations()` SQL function + manual "Rebuild" button.
3. Chart of Accounts page + Account Mapping panel.
4. Journal page (list + manual entry editor).
5. Ledger page (per-account view).
6. Trial Balance page.
7. Balance Sheet page (real, derived from GL).
8. Switch Cashflow to GL-backed view; add P&L source toggle.
