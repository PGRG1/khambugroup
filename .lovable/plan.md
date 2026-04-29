## Goal

Add dedicated **Accounts Receivable (AR)** and **Accounts Payable (AP)** sections under Finance so you can track who owes you money (merchant settlements, KPAY, etc.) and who you owe (suppliers) — with aging, per-counterparty drill-down, and quick "settle/pay" actions.

## What you'll see in the app

Two new pages under the **Finance** sidebar group:

### 1. Accounts Receivable (`/finance/receivables`)
KPI strip + tabs:
- **Outstanding Total** | **Overdue (>30d)** | **Settled This Month** | **Avg Days to Settle**
- Tab A — **By Account**: list of all AR accounts (Merchant Receivable Visa/Mastercard/Amex/KPAY/etc.) with current outstanding balance, last activity date, and a sparkline of the last 30 days.
- Tab B — **Open Items**: every unsettled debit line (date, venue, account, amount, age bucket: 0–7 / 8–30 / 31–60 / 60+). Row action: **Mark Settled** (creates a balancing journal entry crediting the AR account and debiting the chosen Cash account on a chosen date).
- Tab C — **Aging Summary**: matrix of AR account × age bucket (Current / 1–30 / 31–60 / 61–90 / 90+).

### 2. Accounts Payable (`/finance/payables`)
KPI strip + tabs:
- **Total Owed** | **Overdue** | **Paid This Month** | **Avg Days to Pay**
- Tab A — **By Supplier**: each supplier with outstanding balance, last invoice date, oldest unpaid invoice age. Click → drill down to that supplier's invoices.
- Tab B — **Open Invoices**: every `unpaid` invoice (date, supplier, invoice #, venue, amount, age bucket, due date if set). Row actions: **Mark Paid** (opens the existing payment dialog) and **Open Invoice**.
- Tab C — **Aging Summary**: supplier × age bucket matrix, with totals row.

Both pages get a **CSV export** that respects current filters (UTF-8 BOM as per project standard).

## Data sources (no schema changes needed)

Everything is derived from existing tables:

- **AR balances** = `journal_lines` filtered to accounts where `account_type='asset'` AND `name ILIKE 'Merchant Receivable%'` (plus a configurable AR account list). Balance = Σ debit − Σ credit per account.
- **AR open items** = ungrouped journal lines on AR accounts; "settled" detection uses FIFO matching of credits against debits per account (oldest debit first). Lines whose cumulative debit total still exceeds cumulative credit total are "open"; the residual age = age of the oldest unmatched debit slice.
- **AP balances** by supplier = sum of `invoices.total_amount` where `status='unpaid'` per `supplier_id`. (No FIFO needed — invoices already have a paid/unpaid flag and a payment ledger.)
- **AP open invoices** = `invoices` join `suppliers` join `invoice_payments` where `status='unpaid'`.

## Cleanup item (small data hygiene)

There are **two AP accounts** in the Chart of Accounts: `2010 Accounts Payable` (0 lines) and `2100 Accounts Payable` (1,026 lines, used by ledger rebuild). The plan will:
- Detect this on first AP page load and show a one-time banner offering to **archive `2010`** (mark `is_active=false`) so reports only show the active one. No data loss; nothing to migrate.

## Technical details

**New files:**
- `src/pages/finance/Receivables.tsx`
- `src/pages/finance/Payables.tsx`
- `src/components/finance/AgingMatrix.tsx` (shared age-bucket table)
- `src/components/finance/SettleReceivableDialog.tsx` (creates a manual journal entry: Dr Cash / Cr AR account)
- `src/hooks/useReceivables.ts` (FIFO open-line computation, aging buckets)
- `src/hooks/usePayables.ts` (supplier rollups, aging from `invoice_date`)

**Modified files:**
- `src/App.tsx` — add `/finance/receivables` and `/finance/payables` routes (AdminRoute).
- `src/components/AppSidebar.tsx` — add the two items to `financeItems` with `Wallet` and `CreditCard` (lucide) icons.

**Conventions followed:**
- All Supabase reads via `fetchAllRows` (>1000 row tables: `journal_lines`, `invoices`).
- `card-glass` containers, terracotta/gold accents, font-mono for numbers.
- 3-state column sorting on tables.
- CSV export with UTF-8 BOM.
- Settling a receivable inserts into `journal_entries` + `journal_lines` (status `posted`, source_type `manual`, balanced).
- "Mark Paid" on AP reuses the existing `invoice_payments` insert flow from `ProcurementInvoicesTab` (no duplicate payment logic).

**Aging bucket definition** (shared constant): `Current (≤0d past invoice/entry date)`, `1–30`, `31–60`, `61–90`, `90+`.

## Out of scope (flag for later)

- Customer/debtor master table for non-merchant AR (e.g., catering invoices issued to corporate clients). Today AR = card processor settlements only. If you want to issue invoices *to* customers, that's a separate module.
- Auto-import of bank/merchant settlement files to auto-clear AR lines.
- Email reminders for overdue AP.