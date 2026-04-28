## Goal

Add a **second Cashflow view** that reads strictly from the **journal/ledger** (posted entries hitting accounts flagged `is_cash = true` in the Chart of Accounts). The current `/finance/cashflow` page derives numbers from operational tables (sales_records, invoice_payments, hr_payroll, pl_manual_lines), which can drift from the books. The new page is the **accountant's view** — it always agrees with the Trial Balance and Balance Sheet.

## Why this matters

- The existing Cashflow can disagree with the General Ledger if a manual journal entry is posted, or if a sales/invoice record is created without flowing into the ledger.
- The new view answers: *"According to the books, how much cash actually moved?"* — the same number the Balance Sheet shows for cash.
- Useful as a reconciliation tool against the operations-based Cashflow.

## What to build

### 1. New page: `/finance/cashflow-ledger`

Route alongside the existing `/finance/cashflow`. Sidebar entry under Finance: **"Cashflow (Ledger)"**. Existing page renamed in the sidebar to **"Cashflow (Operations)"** to make the distinction clear (route unchanged).

### 2. Data source

A single view already exists and is perfect: **`v_cash_movements`**. It returns every journal line that touches a cash account (`is_cash = true`), with: `entry_date`, `source_type`, `memo`, `venue`, `account_code`, `account_name`, `cash_in` (debit), `cash_out` (credit), `net_cash`.

Currently only `1020 — Cash on Hand` is flagged `is_cash`. The page will also show a small note explaining that merchant receivables (Visa, Mastercard, etc.) are **not** cash until settlement, so they don't appear here.

### 3. New hook: `src/hooks/useLedgerCashflow.ts`

- Uses `fetchAllRows("v_cash_movements", "*")` to bypass the 1000-row cap (per `mem://logic/finance-views-pagination`).
- Filters by date range and venue in JavaScript.
- Buckets movements by month/quarter/year via the existing `cashflowCalculations.ts` helpers.
- Computes opening balance from `v_balance_sheet` for cash accounts as of the day before `fromDate` (or uses the manual `cashflow_settings.opening_balance` if user prefers).
- Returns `{ buckets, totals, byAccount, byCategory, recentTxns, loading }`.

### 4. Page layout (mirrors existing Cashflow for familiarity)

- Header: "Cashflow (Ledger)" + tagline "Derived from posted journal entries — always matches Trial Balance."
- Filters: granularity (Month/Qtr/Year), venue, date range, **cash account filter** (defaults to "All cash accounts").
- KPI cards: Total Cash In, Total Cash Out, Net Movement, Closing Cash Balance.
- Composed chart: bars for in/out, line for net, dashed line for running cash balance.
- Period breakdown table.
- **By cash account** breakdown (e.g. 1020 Cash on Hand) — useful when more cash accounts get added.
- **By source type** breakdown (sales, manual, invoice, payroll, etc. — based on `je.source_type`).
- Recent cash events (last 20 journal lines with link to view in General Ledger by entry_id).
- CSV export.

### 5. Reconciliation banner (optional but recommended)

A small card at the top: *"Operations-based Cashflow shows X. Ledger Cashflow shows Y. Difference: Z."* with a link to a quick diff. If they disagree, click → opens the operations Cashflow side-by-side.

## Files to create / modify

| File | Change |
|---|---|
| `src/pages/finance/CashflowLedger.tsx` | NEW — the page |
| `src/hooks/useLedgerCashflow.ts` | NEW — data hook |
| `src/App.tsx` | Add route `/finance/cashflow-ledger` |
| `src/components/AppSidebar.tsx` | Add nav entry; rename existing to "Cashflow (Operations)" |

No DB migrations required — `v_cash_movements` already exists.

## Verification

- Numbers in "Closing Cash Balance" must equal the Cash on Hand line on the Balance Sheet for the same date range.
- Sum of `cash_in - cash_out` across all venues/periods must equal the change in Cash on Hand on the Trial Balance.
- Toggling venue filter narrows movements; "All Venues" matches the Balance Sheet exactly.
