
# Bank Reconciliation Module — Plan

A new Finance section page at `/finance/bank-reconciliation` that handles per-account and consolidated bank reconciliation, with full data model, matching engine, and period-close workflow.

This is a large module. Proposed delivery in **3 phases** so you can verify each before moving on. Confirm the phasing or ask for it all at once.

---

## Phase 1 — Foundations (data model + master + statement import + transactions + overview)

**Database (new tables, all with RLS: read = authenticated, write = admin/manager):**

- `bank_accounts` — id, account_name, bank_name, account_number_last4, currency, venue, entity, linked_gl_account_id (FK chart_of_accounts), opening_balance, opening_date, is_active, last_reconciled_date
- `bank_statement_imports` — id, bank_account_id, period_start, period_end, opening_balance, closing_balance, file_url, uploaded_by, uploaded_at, status
- `bank_transactions` — id, import_id, bank_account_id, txn_date, description, reference, money_in, money_out, running_balance, status (`unmatched|suggested|matched|partial|needs_review|duplicate|ignored|transfer_pending|reconciled|bank_fee`), match_confidence, matched_record_type, matched_record_id, notes, created_at
- `bank_reconciliation_periods` — id, bank_account_id, period_start, period_end, statement_balance, ledger_balance, difference, status (`open|locked`), locked_by, locked_at
- `bank_audit_trail` — id, ts, user_id, action, bank_account_id, bank_transaction_id, old_status, new_status, notes (JSONB)

GL link enforced in app: cannot upload statement until `linked_gl_account_id` set.

**Storage:** new private bucket `bank-statements` with admin/manager RLS. CSV/PDF upload, parsed client-side (CSV) or stored for manual entry first pass.

**UI (new files under `src/pages/finance/bank-recon/`):**

- `BankReconciliation.tsx` — page shell, header (title, bank account selector with "All Accounts" option, period selector, upload, export, lock, status badge), tabs container
- `OverviewTab.tsx` — KPI cards (statement balance, ledger balance, difference, matched/unmatched counts), per-account status table, matched-vs-unmatched chart
- `BankAccountsTab.tsx` — master CRUD table with link-GL action, opening balance, status column
- `BankTransactionsTab.tsx` — transactions table with filter chips, sticky header, right-side detail drawer (`TxnDetailPanel.tsx`) showing suggested matches, related records, confirm/journal/transfer actions
- `useBankReconciliation.ts` hook — fetches via `fetchAllRows`, computes ledger balance from `journal_lines` filtered by linked GL account, computes difference

Routes added in `App.tsx`. Sidebar entry under Finance group.

---

## Phase 2 — Matching workflows

Tabs and matching engine:

- `SuggestedMatchesTab.tsx` — runs `suggestMatches()` util that scores candidates by: amount (exact/within tolerance), date proximity (±5d), supplier name fuzzy (bank description vs `suppliers.name`), reference vs invoice_number, payment_method. Returns confidence high/medium/low.
- `KpaySettlementsTab.tsx` + new tables `kpay_settlements`, `kpay_settlement_settings` (venue → settlement bank account, default fee account, settlement delay). Settlement match creates 3-line journal (Bank Dr / Fee Dr / Receivable Cr).
- `CashDepositsTab.tsx` + new table `cash_deposits` linking cash-on-hand source account to destination bank account. Shortage/overage posts to configurable expense/income accounts.
- `SupplierPaymentsTab.tsx` — matches bank outflows to one or many open invoices (uses existing `invoices` + `invoice_payments`). Multi-invoice match writes multiple `invoice_payments` rows + one journal entry against the bank's GL account.
- `InterAccountTransfersTab.tsx` + new table `inter_account_transfers`. Pairs outgoing/incoming bank lines; statuses: matched / pending_in / pending_out / amount_diff / timing_diff.
- `UnmatchedItemsTab.tsx` — split view: unmatched bank lines (left) and unmatched ledger lines from the linked GL account (right).

All matches use existing `journal_entries` / `journal_lines` infrastructure (with `manually_adjusted = true` to survive rebuilds), plus update `bank_transactions.status` and write to `bank_audit_trail`.

---

## Phase 3 — Rules, journals, audit, period close

- `JournalAdjustmentsTab.tsx` — list of journals created from bank recon (filter `journal_entries.source_type IN ('bank_recon', 'bank_fee', 'bank_transfer')`). Quick-create journal modal with bank/contra account picker.
- `RulesTab.tsx` + new table `bank_recon_rules` — keyword → category/COA/supplier auto-match. Engine runs on statement import, applies high-confidence matches automatically when allowed.
- `AuditTrailTab.tsx` — reads `bank_audit_trail` with filters by user/account/action/date.
- `PeriodCloseTab.tsx` — checklist UI (difference=0, no high-priority unmatched, no unresolved KPay/cash differences, ledger==statement). Lock writes a row to `bank_reconciliation_periods` and prevents edits via RLS check (`status = 'open'`). Admin can unlock.
- Export: CSV reconciliation report per account, plus PDF reusing the `generatePLReport` styling pattern.

---

## Design

Hybrid of existing dark `card-glass` aesthetic but with **lighter table surfaces** for institutional feel: cards stay dark, table rows on `bg-card/50` with hover. Status chips reuse `.chip-success/warn/danger/info/neutral`. Right-side detail panel uses Sheet component. All amounts via `@/utils/format`, `td-num` class.

---

## Out of scope (this build)

- Automated bank-feed connectors (Plaid/etc.) — manual CSV/entry only
- OCR of PDF statements — files stored, user keys data or imports CSV
- FX revaluation across currencies — single currency per account
- Forecasting cash position — separate concern

---

## Confirm before I start

1. **Phasing**: deliver Phase 1 first, then 2, then 3? (Recommended — page is large.)
2. **Statement upload**: CSV import for v1 (paste/upload + column mapping), with manual single-line entry as fallback? PDF parsing later.
3. **Existing cash accounts**: I'll auto-seed `bank_accounts` from `chart_of_accounts` rows where `is_cash = true` so your current ledger keeps working — OK?
