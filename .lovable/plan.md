
# Finance Section Audit — Read-Only Report
*(Profit & Loss page excluded from scope and untouched.)*

---

## PART 1 — TRANSACTION FLOW INTEGRITY

### 1. Revenue / Sales → Journal → Ledger — **PARTIAL**
- `rebuild_journal_from_operations` (public schema) drives it. It correctly rewrites `sales_summary` drafts only, preserving posted ones, and does membership + admin checks (tenant-safe).
- DB reality: `journal_entries` has 450 `sales` + 561 `sales_summary` entries, all posted, all balanced (0 unbalanced out of 1,011). Double-entry integrity for revenue **works**.
- Payment-method split lands in a per-venue `payment_settlement_clearing` account, per method line (matches project memory). No processor split at this stage — that happens in settlement clearing.
- **Broken:** `sales_records` never have `source_id` written on the journal — 0 of 561 records are mappable back to a source row (`src_ids:0`). Users cannot answer "which JE came from which sales record". `useSalesData.ts:107` triggers rebuild but the RPC keys the memo, not `source_id`.
- **Broken:** `useSalesData` calls `rpc("rebuild_journal_from_operations", { p_tenant_id })` but uses `(supabase as any)` — silently no-ops if tenantId is stale and there is no toast on error.
- **Partial:** No end-user "unmapped venue / unmapped method" warning surface — the RPC will fall back to suspense but nothing in the UI flags it. `useUnmappedVenues` exists but is not wired into Journal/Dashboard.

### 2. Procurement Invoices (+ discounts / refunds) → AP → Journal — **PARTIAL**
- 1,141 invoices in DB, 1,118 have journal entries (source_type='invoice') — 23 approved invoices are NOT posted. All 1,118 posted entries balance.
- `invoice_discount` and `invoice_refund` rule types exist in `RULE_TYPES` and in the RPC — correct.
- **Broken:** Only 5 of 1,141 invoices have `payment_status='paid'` and there are **0 rows** in `payments` and **0 rows** in `invoice_payments`. AP payments have never posted to journal in practice. AP flow ends at the invoice booking; no cash-side clearing is happening. `AllocatePaymentDialog.tsx` writes to `invoice_payments` but there is no `invoice_payment` source_type in the journal (Journal.tsx knows the label but the RPC never generates it).
- **Broken:** Credit-note allocations (`payment_allocations.credit_note_amount_applied`) update `credit_notes.remaining_balance` but never post the offset JE — the AP subledger and GL will drift the moment credit notes are used at scale.
- **Risk:** `usePayables.ts` fetches everything WITHOUT `tenant_id` filter (lines 113, 119, 131, 152, 163, 167, 313–319, 340) — cross-tenant data leak & wrong balances if multi-tenant.

### 3. Payroll → Journal — **BROKEN**
- 27 rows in `hr_payroll` but only 5 rows in `journal_entries.source_type IN (payroll, payroll_payment, payroll_accrual)` — 22 payroll runs never posted.
- `hr_payroll_payment_batches` has 0 rows — payment side of payroll has literally never been booked.
- The RPC uses `rebuild_payroll_accrual` (referenced in `pg_proc` list) but no code path calls it independently, and there is no reversal logic for the following period (accrual → payment offset never occurs).
- **Missing account rules:** `payroll_salary_expense`, `payroll_mpf_expense`, `salary_payable`, `mpf_payable` are defined in `RULE_TYPES` but are not enforced — nothing warns the user if they're unmapped before running payroll.

### 4. Payments & Settlements → Journal — **PARTIAL**
- `payment_settlement_batches`: 60 batches, 0 reconciled, 54 journal entries (`settlement_clearing`). 6 batches are un-cleared.
- `usePaymentSettlements.ts` is the only hook that correctly scopes `tenantId` — good.
- **Broken:** Settlement processor fees post via the RPC's `processor_fee_default` rule but there is no per-processor override in `account_mapping_rules` beyond a single default → all processors post to one expense account, defeating YeahPay/KPay separation.
- **Broken:** Bank fees — only 1 `bank_fee` journal entry in DB against a bank_transactions table where fees appear multiple times. Under-posted.
- **Partial:** Timing differences (settlement date vs bank date) — no aging surface anywhere; MonthlyReconciliationTab shows counts but not the diff-days KPI.

### 5. Bank Reconciliation → Ledger — **BROKEN**
- 88 of 143 bank txns are **unmatched**; the UI shows them but never converts to a JE. There is no "post as journal / create bill" button in the unmatched list.
- **Critical multi-tenant leak:** `useBankReconciliation.ts` (all 5 `fetchAllRows` on lines 66–70) — no `tenantId` argument. Every user sees every tenant's bank accounts, transactions, imports, COA, and every journal line ever posted. Same in `BankReconciliation.tsx:55` (`bank_recon_rules`).
- The hook also pulls **every journal_line ever** just to compute per-account ledger balances — will not scale (currently ~1000+ rows, will blow up).
- Bank recon status has no effect on ledger — matched/unmatched is metadata only; no `journal_entries.source_type='bank_txn'` for a manual bank match.

### 6. `rebuild_journal_from_operations` — **WORKS with caveats**
- Multi-tenant enforcement is correct (admin check + tenant membership check + p_tenant_id required).
- Every INSERT/DELETE inside is `.where tenant_id = p_tenant_id` — verified.
- Preserves posted + manually_adjusted drafts.
- **Caveat:** 591 lines, single monolith — no per-section idempotency reporting (returns only `entries_created`). No warning surfaced when suspense is used as fallback.
- **Caveat:** DELETE list on line 78 does not include `payroll_accrual` — running rebuild does not touch payroll, so accruals go stale silently.

### Double-Entry Integrity Snapshot (current DB)
- 2,197 journal_entries, **0 unbalanced** across every source type. ✔
- Trial Balance ties (via `v_trial_balance`). ✔
- Balance Sheet uses `v_balance_sheet` with tenant scoping. ✔
- Cash Flow — `CashflowStatement.tsx` uses hardcoded `CASHFLOW_VENUES` (venue drift after Arca/Events migration).

### Modules that bypass the journal (must not)
- Payroll payments (0 batches, 0 JEs).
- Credit note applications (no offset JE).
- Bank fees seen in `bank_transactions` (only 1 posted vs many observed).
- Manual bank matches (no source_type at all).

---

## PART 2 — UX / UI FINDINGS (Finance section, excl. P&L)

**Grep result: 0 of 17 finance pages use `PageHeader`, `KpiCard`, or `KpiGrid`.**  Finance is the only major section not migrated to the shared design primitives (Revenue, Procurement, Expenses were migrated in prior turns).

| Page | Key deficiencies |
|---|---|
| Dashboard.tsx (537 lines) | No PageHeader; KPIs hand-rolled; no tenant filter on line 113 fetch (`chart_of_accounts` no `.eq("tenant_id"…)`); no skeletons; no period selector persisted in URL. |
| Payables.tsx (1,030 lines) | Massive single file; no PageHeader; tables not right-aligned tabular-nums for HK$; multiple filter states not URL-persisted; no mobile card fallback; aging matrix not using shared `<StatusBadge>`. |
| Receivables.tsx | Same pattern; hand-rolled status colors; no empty state. |
| BankReconciliation.tsx (533 lines) | Full-tenant leak; no KPI strip; no skeleton; unmatched-txn list has no CTA to post as JE or attach to bill; filter state lost on refresh. |
| Journal.tsx | `SOURCE_LABELS` incomplete (missing `payroll_accrual`, `bank_txn`, `settlement_clearing` shown as raw); source-type filter uses raw enum; `.limit(1000)` cap silently truncates history. |
| Ledger.tsx | Uses `.limit(5000)` on `v_general_ledger` which does not bypass PostgREST 1000-row cap — data is silently truncated; violates project memory rule. |
| LedgerAuditLog.tsx | No PageHeader, no filters, no tenant scoping. |
| ChartOfAccounts.tsx | Inline number/color logic; no bulk import; no "in use / safe to deactivate" indicator. |
| TrialBalance.tsx | Correct integrity but no PageHeader, no comparison period, no drill-through to Ledger. |
| BalanceSheet.tsx | Correct data; no PageHeader; no export; no "as-of" date persistence. |
| CashflowStatement / Cashflow / CashflowLedger / CashflowCombined | Four overlapping pages doing similar things — confusing IA. `CASHFLOW_VENUES` hardcoded. |
| Payments & Settlements (payments/*) | No PageHeader adoption; MonthlyReconciliationTab lacks period selector KPIs; MerchantsTab & FeeRatesTab feel like admin CRUD, not finance software; no aging of unreconciled batches. |
| Bills / Docs pages | Duplicated with `/expenses/bills` post-refactor — DocumentsBills.tsx (304 lines) and BillsExpenses.tsx (827 lines) overlap Expenses > Bills; risk of orphan door. |

Cross-cutting UX issues:
1. No shared skeletons anywhere in `src/pages/finance/`.
2. All HK$ values formatted ad-hoc; not always right-aligned; some pages use `Intl.NumberFormat` inline rather than `fmtHKWhole` / `@/utils/format`.
3. No mobile card layouts — every table just horizontally scrolls on phone.
4. Filter/URL state persistence absent (period, venue, account, status).
5. Status color logic hand-rolled per file → inconsistent badges (compare Payables vs Journal vs BankRecon).
6. No shared empty state — mixture of "No data", blank tables, and `null`.
7. Sub-navigation between Finance modules is flat; no left-side rail grouping (Reports / Accounting / Ops).

---

## PRIORITIZED FINDINGS & FIXES

### (A) CRITICAL LOGIC BREAKS  *(fix first, blocking correctness)*
1. **AP payment posting missing.** Fix: add `post_invoice_payment(p_payment_id)` RPC that debits AP / credits cash-account (via `payment_method_cash` rule) and links `payments.journal_entry_id`. Wire from `AllocatePaymentDialog` and `RecordPaymentDialog`.
2. **Payroll payment posting missing.** Fix: create `post_payroll_batch(p_batch_id)` and call on batch confirm; reverse prior-month accrual via `payroll_accrual` rule.
3. **Multi-tenant leaks.** Fix: scope every `fetchAllRows` / `supabase.from` in `useBankReconciliation`, `usePayables`, `useReceivables`, `LedgerAuditLog.tsx`, `Dashboard.tsx` (line 113), and `BankReconciliation.tsx` (`bank_recon_rules`) with `tenantId`.
4. **Credit-note application never posts offset JE.** Fix: extend `post_invoice_payment` (or a sibling RPC) to book the credit-note debit against AP with source_type='credit_note_application'.
5. **`Ledger.tsx` `.limit(5000)` silently truncates.** Fix: replace with `fetchAllRows("v_general_ledger", …, { …, tenantId })`. Same fix for `useJournal.fetchAll` `.limit(1000)`.

### (B) INTEGRITY RISKS
6. **Rebuild RPC does not touch payroll.** Add `payroll_accrual` / `payroll_payment` to DELETE list and regenerate.
7. **Bank fees under-posted** (1 vs many). Add automatic `bank_fee` JE creation on statement import for known fee descriptions (already have `bank_transfer_fee_default` rule).
8. **Unmapped-account fallback silent.** Surface unmapped venues/methods on Dashboard + Journal with links to Chart of Accounts mapping matrix.
9. **`CashflowStatement.tsx` hardcoded venues.** Replace `CASHFLOW_VENUES` with `useVenues()` — fixes Arca/Events drift.
10. **Sales JE source_id missing.** Store the originating `sales_record.id` (or day summary key) on `journal_entries.source_id` so users can trace back.
11. **Per-processor fee mapping.** Extend `account_mapping_rules` with `rule_type='processor_fee|<processor_id>'`; RPC reads that first, falls back to default.
12. **Add `manually_adjusted=false` orphan detector** — nightly view of posted entries whose source row was deleted.

### (C) UX / UI FIXES  *(rollout after A/B)*
13. Migrate all 17 finance pages to `PageHeader`, `KpiGrid`, `KpiCard`, `StatusBadge`, `TableSkeleton`, `EmptyState`, and `@/utils/format` (`fmtHKWhole`, `fmtCurrency`, `fmtDate`).
14. Persist filters (period, venue, account, status) to URL search params on Dashboard, Payables, Receivables, Journal, Ledger, BankReconciliation, TrialBalance, BalanceSheet, CashflowStatement.
15. Add skeletons + empty states with actionable CTAs (e.g., "No unmatched transactions — Import statement").
16. Right-align all HK$ columns and use `tabular-nums`; never truncate numeric cells.
17. Add mobile card layouts for Payables, Receivables, Journal, BankReconciliation.
18. Add unmatched-txn CTAs: "Post as JE", "Create bill", "Match to invoice/payment".
19. Consolidate cashflow pages (four exist — decide keep `CashflowStatement.tsx` as canonical; retire duplicates or make them tabs).
20. Retire `DocumentsBills.tsx` / `BillsExpenses.tsx` as separate finance routes (already served by `/expenses/bills`).
21. Journal filter: label enum values via `SOURCE_LABELS` + include the three missing types.
22. Trial Balance: add prior-period comparison + click-through to Ledger.
23. Balance Sheet: add As-Of date picker persisted in URL, and Export to PDF.
24. Dashboard: add "Unmapped venues / methods" and "Unposted approved invoices" tiles.

---

## OVERALL VERDICT

**Not at professional finance-software standard yet.** Double-entry math is clean and the rebuild RPC is well-guarded, but three whole subledgers (AP payments, payroll payments, credit-note applications) never reach the GL, three finance hooks leak across tenants, and the entire section skipped the design-system migration that Revenue / Procurement / Expenses already went through. Fix the five (A) items to reach *correct*, the seven (B) items to reach *auditable*, and the (C) rollout to reach *Ramp-grade polish*.

*No code changes were made — this is a read-only audit awaiting build-mode approval.*
