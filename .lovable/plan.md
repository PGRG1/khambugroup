## Goal

Promote Expenses into a standalone top-level section in the Bani sidebar (alongside Revenue, Procurement, Finance, People). Keep Procurement strictly for inventory, and refocus Finance on AP/AR/payments/bank. Existing `expense_bills` infrastructure (table, scanner, edge function) is reused — this work is mostly new pages, a sidebar group, and 3 small supporting tables.

## Sidebar change

Add a new `EXPENSES` collapsible group with 8 entries. Remove the legacy "Bills & Expenses" link from the Finance group so non-inventory work lives in one place only. Finance keeps: Overview, Document Centre, Documents & Bills, AP, AR, Payments & Settlements, Bank Recon, Reports, Accounting.

```text
EXPENSES
  Overview                 /expenses
  Expense Bills            /expenses/bills
  Vendor Statements        /expenses/statements
  Bank-Detected            /expenses/bank-detected
  Recurring Expenses       /expenses/recurring
  Categories               /expenses/categories
  Approvals                /expenses/approvals
  Analytics                /expenses/analytics
```

Visible only to admins/managers (same gate as Finance).

## Pages (all under `src/pages/expenses/`)

1. **Overview.tsx** — KPI cards (Total this month, Bills to pay, Overdue, Paid, Bank-detected, Needs review, Avoidable costs/late fees) + two charts (by category, by source) + a unified table with tabs `All | Bills | Statements | Bank-Detected | Recurring | Needs Review | Overdue`. Primary action `New Expense`; secondary `Upload Bill`, `Upload Statement`, `Review Bank-Detected`, `Manage Recurring Rules`. Row click → right-side drawer with tabs **Details / Allocations / Approvals / Payments / Audit Trail**.
2. **ExpenseBills.tsx** — Thin reuse of existing `BillsExpenses.tsx` logic, restyled for the Expenses shell. The existing `/finance/bills-expenses` route stays as an alias so nothing breaks; the sidebar link moves.
3. **VendorStatements.tsx** — List + editor capturing: opening balance, current period charges, payments/credits, late fees, closing balance. Only `current_period_charges` + `late_fees` post to P&L; opening balance flagged as old AP and excluded from new-expense totals.
4. **BankDetectedExpenses.tsx** — Lists `bank_transactions` flagged as expense (charges/interest/fees/direct debits not yet linked to an AP bill). One-click "Post directly to expense" → Dr Expense / Cr Bank (no AP).
5. **RecurringExpenses.tsx** — CRUD on recurring rules (vendor, category, account, venue, cadence, expected amount, next due). Optional "Generate this month's bill" action.
6. **Categories.tsx** — Manage `expense_categories` (already exists) + default GL account mapping.
7. **Approvals.tsx** — Inbox of bills/statements in `pending_review` for the current approver, with approve/reject + comment.
8. **Analytics.tsx** — Trend by month, breakdown by category/source/venue, avoidable-costs panel (late fees, penalties, overdraft).

## Detail drawer

Single reusable `ExpenseDetailDrawer` component used by Overview, Bills, Statements, Bank-Detected. Tabs:

- **Details** — vendor, type, source, doc number, date, due date, service period, venue, department, total, tax, status
- **Allocations** — multi-row (category, account, venue, department, amount, tax, notes)
- **Approvals** — uploaded by / reviewed by / approved by / timestamps / comments
- **Payments** — status, paid, outstanding, date, method, bank account, bank match
- **Audit Trail** — every classification, approval, posting, payment update, reversal

## Document routing

Reuse the existing `parse-bill` edge function's `suggested_document_type`. Centralise a small `classifyDocument()` helper that maps the suggestion → one of: `procurement_invoice | expense_bill | vendor_statement | asset_purchase | payroll | bank_document | manual_journal`. When the user lands on Expenses' "Upload Bill" and the AI suggests `procurement_invoice`, show a confirm dialog offering to route to Procurement instead (does not auto-create). No change to procurement flows.

## Database (new — small additive migration, no breakage)

```text
expense_vendor_statements         header (vendor, period, opening, current_charges,
                                  payments_credits, late_fees, closing, status)
expense_vendor_statement_lines    optional line breakdown (date, description, amount, type)
expense_recurring_rules           vendor_id, category_id, account_id, venue_id, amount,
                                  cadence (monthly/quarterly/yearly), day_of_month, next_due,
                                  active, last_generated_at
bank_transactions.expense_posted_bill_id   NEW nullable FK → expense_bills.id
                                  (for Bank-Detected → direct expense posting)
```

All four follow the standard pattern: GRANTs, RLS enabled, admin/manager full access, authenticated read.

Reused as-is: `expense_bills`, `expense_bill_allocations`, `expense_bill_payments`, `expense_bill_audit`, `expense_bill_links`, `expense_categories`, `chart_of_accounts`, `suppliers`, `venues`, `bank_transactions`, `bank_accounts`.

## Accounting postings

Triggered on `postBill` / `postStatement` / `postBankExpense`:

- Expense bill approved → Dr each allocation's expense account / Cr AP
- Expense bill paid → Dr AP / Cr Bank (existing flow)
- Bank-detected expense → Dr expense account / Cr Bank (no AP)
- Vendor statement post → Dr each `current_period_charges` line + `late_fees` / Cr AP; opening balance ignored
- Utility w/ late charge → single bill, two allocation rows (Utilities, Late Payment Charges) / Cr AP

All postings flow through the existing `journal_entries` + `journal_lines` insert path used today.

## Design

- Dark sidebar group matches existing `CollapsibleNavGroup` styling — emerald hover, no special icons beyond Lucide `Receipt`, `FileStack`, `Landmark`, `Repeat`, `Tags`, `CheckCircle2`, `BarChart3`.
- Pages use `PageHeader`, `KpiCard`/`KpiGrid`, `StatusBadge`, `card-glass`, and `@/utils/format` — no hand-rolled colors or number formatting.
- No SKU/UOM/inventory/menu-costing fields anywhere in Expenses pages.
- Drawer is `Sheet` from the right, ~640px wide, with `Tabs` for the 5 sections.

## What does NOT change

- Procurement pages, tables, scanners, menu-costing — untouched.
- Finance AP/AR/Payments/Bank Recon — untouched (only the sidebar shortcut to "Bills & Expenses" is removed from Finance).
- `/finance/bills-expenses` route still resolves (kept as alias) so any deep links keep working.

## Build order

1. Migration (4 tables/columns + GRANT/RLS)
2. Sidebar group + route registration in `App.tsx`
3. `ExpenseDetailDrawer` shared component
4. Overview page + tabs + KPIs
5. ExpenseBills (reuse existing logic, new shell)
6. VendorStatements (table + editor + posting)
7. BankDetectedExpenses (list + direct-post action)
8. RecurringExpenses (CRUD + generator)
9. Categories / Approvals / Analytics
10. Document-routing helper + confirm dialog on Upload Bill
