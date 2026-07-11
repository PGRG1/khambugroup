
# Finance Section Audit (P&L excluded)

Scope: Dashboard, Payables, Receivables, Payments & Settlements, Bank Reconciliation, Balance Sheet, Cash Flow, Trial Balance, Journal, Ledger, Chart of Accounts, Ledger Audit Log.

Baseline sanity (live DB, tenant `…beef`): 1,118 invoice + 1,000 sales journals; posted debit = credit = HK$17,942,954.05 (0.00 diff). Trial balance balances. So the *ledger core* is sound — the problems sit around it.

---

## PART 1 — Accounting logic & data-flow findings

### P0 — Cross-tenant read leaks (super-admin sees merged data)

1. `src/hooks/useBankReconciliation.ts` `load()` calls `fetchAllRows("bank_transactions" | "bank_accounts" | "chart_of_accounts" | "journal_lines")` **without a tenantId argument**. On a platform-admin login every tenant's bank ledger balances merge silently → wrong `ledgerBalanceFor()` and wrong reconciliation status.
2. `src/hooks/useReceivables.ts` fetches `journal_lines` unscoped — AR aging on any super-admin session mixes tenants.
3. `src/hooks/usePayables.ts` (visible fetch pattern) — same risk; needs a re-pass to add `tenantId` to every `fetchAllRows` and `.eq("tenant_id", …)` on every direct `.from()`.
4. `src/pages/finance/LedgerAuditLog.tsx` queries `ledger_audit_log` without a tenant filter.
5. `src/pages/finance/BankReconciliation.tsx` reads `bank_recon_rules` without tenant filter (line 55).
6. `src/pages/finance/Dashboard.tsx` uses `fetchAllRows` (`v_pl`, `v_balance_sheet`, journal_lines) with no tenantId passed.

Rule to enforce project-wide (already in `src/lib/tenantQuery.ts`): every finance read that hits a `tenant_id`-bearing table MUST go via `tenantSelect` / `fetchAllRowsForTenant` or attach an explicit `.eq("tenant_id", tenantId)`.

### P0 — Missing / broken postings

7. **Payroll payments never post to the ledger.** `post_payroll_accrual` exists and 5 accruals are posted, but the DB has 0 rows with `source_type IN ('payroll_payment','mpf_payment')` — `salary_payable` / `mpf_payable` never clear. `post_payroll_payment_batch` exists as a function, but it's not being invoked from the payment-batch UI (or is failing silently). Aging on AP payroll payables will grow forever.
8. **Bank fees under-posted.** 1 `bank_fee` JE for 88 unmatched bank transactions — the classifier flags them (`suggested_type='bank_fee'`) but nothing books them until a user hand-posts. No automated bank-fee sweep or "post all suggested fees" bulk action.
9. **`rebuild_journal_from_operations` coverage gap.** It rebuilds only `sales_summary | invoice | invoice_payment | settlement_clearing | bank_txn`. It does NOT rebuild expense bills (`post_expense_bill` only) or vendor statements (`post_vendor_statement`) or payroll. That is defensible for *posted* entries but means a partially-drafted expense bill deletion won't be rediscovered. Document this or extend to rebuild drafts for all sources.
10. **88 unmatched bank transactions with no reminder surface.** No dashboard KPI, no red pill in the sidebar, no "N txns awaiting review" badge on the Bank Recon tab. This is the single biggest finance-hygiene miss.

### P1 — Chart of Accounts & mapping coverage

11. Only 1 mapping row exists for `accounts_payable`, `sales_cash`, `salary_payable`, `mpf_payable`, `payroll_salary_expense`, `payroll_mpf_expense`, `opening_equity`, `suspense`, `invoice_discount`, `invoice_refund`. If a second venue/entity is added there's no fallback path; the rebuild silently posts to suspense.
12. `useAccountMapping.RULE_TYPES` does not list `processor_fee_default`, `bank_transfer_fee_default`, `cash_payment_clearing` — but the rebuild RPC reads them. Admins can't configure them from the UI, so those postings land wrong or in suspense forever.
13. `Journal.tsx` `SOURCE_LABELS` is missing `sales_summary`, `settlement_clearing`, `bank_fee`, `bank_txn` → users see raw enum strings and the source-type filter dropdown is blind to those categories.

### P1 — Data-fetch correctness

14. `src/pages/finance/Ledger.tsx` line 52: `.limit(5000)` on `v_general_ledger`. Per project memory *"`.limit(N)` does NOT bypass the 1000-row cap"* — swap to `fetchAllRowsForTenant`.
15. `src/hooks/useJournal.ts` `fetchAll` caps entries at 1000. On a mature tenant Journal silently drops old entries; also lines are fetched via `fetchAllRows` then client-filtered — expensive and still tenant-scoped only if the arg is passed (it is here, good).
16. `useBankReconciliation.load()` pulls **all** `journal_lines` to compute one number per account. Move to a tenant-scoped SQL view (`v_gl_balance_by_account`) or an RPC — currently a 20–100k row round-trip.

### P1 — Cash-flow / venue drift

17. `src/pages/finance/CashflowStatement.tsx` imports a hard-coded `CASHFLOW_VENUES` constant from `utils/cashflowCalculations`. Same class of bug we already fixed for Daily Sales and Procurement — Arca and any new venue silently missing. Replace with `useVenues()`.

### P2 — Ledger integrity checks not surfaced

18. `check_journal_balance` function exists but no UI surfaces its output. Add a "Ledger integrity" strip on Dashboard: last rebuild time, trial-balance diff, count of unbalanced entries, count of unmapped-suspense postings.
19. No warning on Chart of Accounts when an account referenced by an `account_mapping_rule` is deactivated — will cause future rebuilds to fail silently.

---

## PART 2 — UX / UI audit

### P1 — Design-system violations (each page hand-rolls what shared primitives already do)

20. Every finance page defines its own `fmt`, `fmtWhole`, `fmtDate`, `fmtSigned` (Dashboard, Payables, Receivables, BalanceSheet, TrialBalance, Journal, Ledger, CashflowStatement, LedgerAuditLog). Project Core rule mandates `@/utils/format`. Replace universally.
21. No page in the Finance module uses `<PageHeader>` / `<KpiGrid>` / `<KpiCard>` / `<StatusBadge>` — the same primitives Expenses and Procurement were just rebuilt around. Section feels disconnected from the rest of the app.
22. `BankReconciliation.tsx` uses `formatCurrency` from `@/utils/salesUtils` (revenue module) — wrong dependency direction; should be `fmtHK` from `@/utils/format`.
23. Status colouring is hand-rolled in every file (e.g. `Payables.tsx` BUCKET_COLOR / BUCKET_ACCENT / BUCKET_TINT triple maps, `Journal.tsx` STATUS_TONE, `BankReconciliation.tsx` `statusChip`). Consolidate into `<StatusBadge>` with semantic tones (primary / info / warning / destructive / muted). No more raw `bg-primary/10` sprinkled per file.

### P1 — Missing loading / empty / mobile

24. `BalanceSheet.tsx`, `TrialBalance.tsx`, `CashflowStatement.tsx`, `Ledger.tsx`, `Journal.tsx`: no skeletons on filter changes; large table just goes blank.
25. No mobile card fallback on any finance table — Payables/Receivables/Journal/Ledger tables overflow horizontally on phones. Match the pattern used in Expenses (`md:table` + `<div className="md:hidden">` cards).
26. Empty states are plain "No data" text — replace with the shared `<EmptyState>` used in Expenses/Procurement.

### P1 — Filter / scope inconsistency

27. Every page has its own venue filter, date filter and search input styled differently. No shared "chip + single scope line summarising active filters" pattern (already established in Daily Sales / Expenses). Adopt it here.
28. Bank Reconciliation Overview tab lacks a KPI row (Unmatched count, Needs Review, This-month reconciled %, Statement-vs-ledger diff). It's the highest-value screen in Finance and currently the least informative.
29. Dashboard has KPI cards but they aren't clickable; each should deep-link to the underlying report (Cash → Bank Recon filtered to that account; Aging → Payables filtered to the overdue bucket, etc.).

### P2 — Copy / semantics

30. Journal source-type filter shows raw enum strings for `sales_summary`, `settlement_clearing`, `bank_fee` (see item 13).
31. Trial Balance page shows `ACCOUNT_TYPE_LABEL[t]` but relies on ordering `["asset","liability","equity","revenue","cogs","opex","other_income","other_expense"]` — add group subtotals matching Balance Sheet groupings for a professional look.
32. Ledger Audit Log has icons but no colour tokens for status; some events not in `EVENT_LABELS` render as raw strings (`invoice_journal_created`, `sales_journal_reversed`, etc.).

---

## Prioritised remediation plan

### P0 — Correctness (do first)
- Add tenant scoping to every read in `useBankReconciliation`, `useReceivables`, `usePayables`, `useJournal`, `LedgerAuditLog.tsx`, `Dashboard.tsx`, `BankReconciliation.tsx` bank-recon-rules query. Route through `fetchAllRowsForTenant` / `tenantSelect`.
- Fix payroll payment posting path: wire the Payments Batches UI to call `post_payroll_payment_batch`; add a "salary/MPF payable outstanding" tile on Dashboard driven by ledger balance so the gap is visible.
- Add "post all suggested bank fees" bulk action and a Dashboard KPI counting unmatched bank transactions; expose `check_journal_balance` output as a Dashboard health strip.

### P1 — Flow / mapping / fetch
- Extend `useAccountMapping.RULE_TYPES` with `processor_fee_default`, `bank_transfer_fee_default`, `cash_payment_clearing`; expose in the mapping matrices under Chart of Accounts.
- Replace `CASHFLOW_VENUES` constant with `useVenues()`.
- Swap `Ledger.tsx` `.limit(5000)` for `fetchAllRowsForTenant`; move bank-recon per-account ledger totals to a SQL view/RPC.
- Round out `Journal.tsx` SOURCE_LABELS.

### P2 — Design system rollout
- Introduce `<PageHeader>`, `<KpiGrid>`, `<KpiCard>`, `<StatusBadge>`, `<EmptyState>`, `<TableSkeleton>` across all finance pages.
- Kill hand-rolled `fmt*` helpers; import from `@/utils/format`.
- Add mobile card layouts, shared filter chips + scope line, deep-link Dashboard KPIs.
- Add group subtotals to Trial Balance; complete Ledger Audit Log event labels.

### Explicitly out of scope
- P&L page — untouched per instruction.
- Migrations creating new tables — none needed; all fixes are code + optional SQL views.

## Verdict
Not yet at professional-institutional standard. The double-entry core is correct and balances, but the module is undermined by (a) real tenant-leak risk for platform admins, (b) payroll-payment postings that never clear their liabilities, (c) 88 unclassified bank transactions with no user-facing signal, and (d) a design layer that looks disconnected from the just-rebuilt Expenses and Procurement sections. Executing P0 + P1 above brings it to parity; P2 makes it feel like one coherent product.
