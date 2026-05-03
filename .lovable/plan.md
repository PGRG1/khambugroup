
## Goal

Add a new page **Cashflow Statement** at `/finance/cashflow-statement` that presents cash movements in the standard accounting structure (Operating, Investing, Financing) — the way it appears in a real set of financial statements.

The two existing pages stay unchanged:
- `/finance/cashflow` — operations / source-based view (sales, invoices, payroll)
- `/finance/cashflow-ledger` — flat ledger view of cash account movements

The new page is the **formal statement** version.

## Layout

```text
Cashflow Statement                             [Period selector] [CSV] [PDF]
For the period: 1 Jan 2026 – 30 Apr 2026

──────────────────────────────────────────────────────────────────
  Opening cash & cash equivalents                       1,234,567
──────────────────────────────────────────────────────────────────
  CASH FLOWS FROM OPERATING ACTIVITIES
    Cash receipts from customers (sales)                2,500,000
    Cash paid to suppliers                             (1,200,000)
    Cash paid to employees (net salaries)                (450,000)
    MPF contributions paid                                (35,000)
    Tips paid out                                         (28,000)
    Other operating receipts / (payments)                  12,000
                                                       ──────────
    Net cash from operating activities                    799,000

  CASH FLOWS FROM INVESTING ACTIVITIES
    Purchase of fixed assets                              (80,000)
    Supplier deposits paid                                (25,000)
    Refunds of supplier deposits                           10,000
                                                       ──────────
    Net cash used in investing activities                 (95,000)

  CASH FLOWS FROM FINANCING ACTIVITIES
    Owner contributions                                    50,000
    Owner withdrawals                                     (30,000)
                                                       ──────────
    Net cash from financing activities                     20,000

──────────────────────────────────────────────────────────────────
  Net increase / (decrease) in cash                       724,000
  Opening cash & cash equivalents                       1,234,567
  Closing cash & cash equivalents                       1,958,567
══════════════════════════════════════════════════════════════════
```

Each section is expandable: clicking a line opens a sub-table showing the contributing journal lines (date, account, memo, amount) so the user can drill into how the figure was built.

A small reconciliation footer confirms:  
**Closing per statement = Cash account balances at period end (per Trial Balance)** — green check or red mismatch with delta.

## Period & filter controls

- **Period selector**: Month / Quarter / Year-to-date / Custom date range (consistent with other Finance pages).
- **Comparison column** (toggle): "vs prior period" — shows the same statement for the previous equivalent period side-by-side.
- **Venue filter**: All Venues / specific venue (uses the `venue` field already present on journal lines).

## Classification logic (Direct method)

Cash movements are classified by looking at the **counter-account** on each cash-side journal line. For each row in `v_cash_movements` we read the *other* account(s) in the same `entry_id` and classify:

| Counter-account type / code                        | Section            | Line item                                |
|----------------------------------------------------|--------------------|------------------------------------------|
| `revenue`, merchant receivables (1220–1295), 1900  | Operating          | Cash receipts from customers             |
| `cogs`, AP (2010/2100), supplier deposits refund   | Operating          | Cash paid to suppliers                   |
| Salary Payable (2040)                              | Operating          | Cash paid to employees                   |
| MPF Payable (2030)                                 | Operating          | MPF contributions paid                   |
| Tips Payable (2110–2140)                           | Operating          | Tips paid out                            |
| `opex` accounts                                    | Operating          | Other operating payments                 |
| Fixed Assets (1500)                                | Investing          | Purchase of fixed assets                 |
| Supplier Deposits (1310) — outflow                 | Investing          | Supplier deposits paid                   |
| Supplier Deposits (1310) — inflow                  | Investing          | Refunds of supplier deposits             |
| Prepayments (1320)                                 | Operating          | Prepayments made                         |
| Owner Equity (3010) inflow                         | Financing          | Owner contributions                      |
| Owner Equity (3010) outflow                        | Financing          | Owner withdrawals                        |
| Anything else                                      | Operating — Other  | Other operating receipts / (payments)    |

A small mapping table at the bottom of the page lists any **unclassified** journal lines so the admin can spot misposted entries.

## Technical Implementation

**New files**
- `src/pages/finance/CashflowStatement.tsx` — the page
- `src/hooks/useCashflowStatement.ts` — fetches `journal_lines` with their entries, joins to `chart_of_accounts`, classifies each line into a statement bucket, and aggregates by period
- `src/utils/cashflowStatementClassifier.ts` — pure function that takes a (cash line, counter accounts[]) tuple and returns `{ section, lineItem }`

**Routing**
- Add route in `src/App.tsx`:  
  `<Route path="/finance/cashflow-statement" element={<AdminRoute><CashflowStatement /></AdminRoute>} />`

**Sidebar**
- Add a new entry **"Cashflow Statement"** under the Finance group in `AppSidebar.tsx`, next to the existing Cashflow / Cashflow (Ledger) entries.

**Data fetching**
- Use `fetchAllRows("v_cash_movements", "*")` (already exists) for cash legs.
- Pull the corresponding non-cash counter-lines via `fetchAllRows("journal_lines", "entry_id, account_id, debit, credit")` filtered to the same `entry_id` set, joined to `chart_of_accounts` for type/code lookup.
- Opening balance = sum of `net_cash` for all dates `< fromDate` on cash accounts.

**Export**
- CSV export with the statement structure (section, line item, amount, comparative).
- Optional PDF export reusing the existing `generatePLReport` styling pattern — out of scope unless requested.

## Out of scope (for this iteration)

- Indirect-method version (start from Net Income, adjust for non-cash items + working capital changes). Can be added later as a toggle.
- Editing classification rules from the UI (rules will live in code; misposted entries shown in the "Unclassified" table).

