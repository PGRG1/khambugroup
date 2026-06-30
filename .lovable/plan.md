
# Bank Module — Implementation Plan

A new top-level **Bank** navigation group with 12 dedicated pages, all reading/writing the same underlying `bank_transactions` and `bank_accounts` tables already in the database. No duplicate datasets — every page is a filtered view / workflow over the shared data.

## Sidebar & Routing

- Add **Bank** as a top-level item in `AppSidebar.tsx` (icon: `Landmark`), grouped like Procurement/Expenses.
- Routes under `/bank/*` registered in `App.tsx` as `AdminRoute`.

```text
/bank/dashboard           Dashboard
/bank/accounts            Bank Accounts
/bank/transactions        Transactions (master ledger)
/bank/reconciliation      Bank Reconciliation
/bank/incoming            Incoming Deposits   (filter: money_in > 0)
/bank/outgoing            Outgoing Payments   (filter: money_out > 0)
/bank/matching            Payment Matching
/bank/transfers           Transfers
/bank/fx                  FX & Multi-Currency
/bank/rules               Bank Rules
/bank/fees                Bank Fees & Charges (filter: bank_fee/service)
/bank/unmatched           Unmatched Transactions (status=unmatched / low conf)
```

## Shared data layer

Single hook `src/hooks/useBankModule.ts` extending the existing `useBankReconciliation.ts`. It exposes:
- `accounts`, `transactions`, `imports`, `rules`, `coa`
- helpers: `ledgerBalanceFor`, `statementBalanceFor`, `byCurrency`, `unmatched`, `pendingMatches`, `feesAndCharges`, `incoming`, `outgoing`, `transfers`
- mutations: `updateTxn`, `categoriseTxn`, `splitTxn`, `attachDoc`, `manualTxn`, `approveTxn`, `runRules`

All pages import this hook — no duplicate fetches.

## Schema additions (one migration)

Existing tables already cover most needs: `bank_accounts` (20 cols), `bank_transactions` (26 cols incl. `match_confidence`, `matched_record_type/id`, `status`), `bank_statement_imports`, `bank_reconciliation_periods`, `bank_recon_rules`, `bank_audit_trail`.

New additions:
- `bank_transactions.value_date date`, `currency text`, `category_account_id uuid`, `attachment_urls text[]`, `parent_txn_id uuid` (for splits), `is_transfer bool`, `transfer_pair_id uuid`, `fx_rate numeric`, `fx_gain_loss numeric`.
- New table `bank_transaction_matches` (txn_id, matched_type, matched_id, amount, confidence, created_by) — supports one-to-many matching.
- New table `bank_fx_rates` (date, from_ccy, to_ccy, rate).
- Extend `bank_recon_rules` if needed for merchant/regex matching (already has match_contains).
- Storage bucket `bank-attachments` (private, RLS by tenant).

All new tables: tenant_id, RLS via `has_role`/tenant membership, GRANTs to authenticated + service_role.

## Page-by-page

1. **Dashboard** — KPI grid (total cash by account/currency), cards: reconciliations needing attention, unmatched count, pending matches, recent imports/recons, 30-day cash movement chart, alerts list.
2. **Bank Accounts** — table + sheet editor (extends existing `bank_accounts` admin patterns). Shows opening/current/reconciled/last-import/last-recon.
3. **Transactions** — full ledger `DataTableShell` with global search, account/date/status filters, inline categorise, split modal, notes, attach docs, manual txn, bulk approve.
4. **Bank Reconciliation** — reuse `src/pages/finance/BankReconciliation.tsx` structure; full workflow with progress meter, matched/outstanding tabs, complete-period action writing to `bank_reconciliation_periods`.
5. **Incoming Deposits** — filtered view (`money_in > 0`); match-to dropdown: revenue/AR/processor settlement/other.
6. **Outgoing Payments** — filtered view (`money_out > 0`); match-to: supplier invoices/expense bills/payroll/tax/other.
7. **Payment Matching** — split-pane: unmatched txns ↔ candidate documents; AI suggestion list with confidence; supports 1-1, 1-N, N-1 via `bank_transaction_matches`.
8. **Transfers** — list `is_transfer=true`; new-transfer dialog creates a paired in/out txn linked via `transfer_pair_id`; auto journal post on approve.
9. **FX & Multi-Currency** — balances by currency, FX rate table editor (`bank_fx_rates`), realised/unrealised gain-loss calc, conversion history.
10. **Bank Rules** — CRUD on `bank_recon_rules` + new categorisation rules (extends `bankTxnRules.ts`); test-rule preview.
11. **Bank Fees & Charges** — filtered view using `classifyTxn` → `bank_fee` / merchant fees / interest; bulk categorise + post.
12. **Unmatched Transactions** — filter `status='unmatched' OR match_confidence='low' OR no attachment`; quick actions: match, categorise, note, request doc, approve, send to reconciliation.

## Design

- Bani dark theme, `card-glass`, `PageHeader`, `KpiCard`, `StatusBadge`, `@/utils/format`, `JetBrains Mono` numerics.
- Chips for status: matched / partial / unmatched / reconciled / disputed.
- All currency via `formatCurrency` honoring account currency.

## Out of scope (explicit)

- No new accounting posting engine — transfers/fees post via existing `journal_entries`/`journal_lines` patterns.
- No bank API integrations (Plaid etc.); imports continue via the existing statement-upload flow.
- No mobile-only layouts beyond existing responsive primitives.

## Execution order

1. Migration (schema additions + new tables + storage bucket + RLS/GRANTs).
2. Shared hook `useBankModule.ts`.
3. Sidebar + routes.
4. Pages in order: Accounts → Transactions → Dashboard → Reconciliation → Incoming/Outgoing/Fees/Unmatched (thin filtered views) → Matching → Transfers → FX → Rules.
5. Typecheck + smoke navigate each route.
