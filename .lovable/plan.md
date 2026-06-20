# Revenue Journal Rebuild

Replace the per-payment-method receivable mapping with a single per-venue **Payment Settlement Clearing** account. Cash still goes to Cash on Hand. Each payment method stays as a separate line (memo = method label). Revenue-side accounting is unchanged. Posted journals are preserved.

## 1. Database — migration

### Schema additions
- Extend `account_mapping_rules.rule_type` CHECK to allow `'payment_settlement_clearing'` and `'cash_on_hand'` (per-venue, `match_key = venue name`).
- Add to `public.journal_lines`:
  - `payment_method text` — e.g. `visa`, `cash`, `alipay`, or NULL for non-payment lines.
  - `source_amount numeric` — original POS amount before any rounding.
  - `mapping_rule_type text`, `mapping_match_key text` — which mapping rule produced this line.
  - `mapping_status text` — `'mapped' | 'missing'` (used when a journal is forced into `draft` because a required mapping is missing).

### COA / mapping seeding (idempotent, never overwrites posted history)
- **Rename in place** the two existing accounts so historical journal_lines keep their FKs:
  - `1290 Merchant Receivable – KPAY (Assembly)` → `1290 Payment Settlement Clearing – Assembly`
  - `1295 Merchant Receivable – KPAY (Caliente)` → `1295 Payment Settlement Clearing – Caliente`
- **Insert if missing** equivalent accounts for every other active venue (Hanabi, Arca, Off-Site / Stall, Events) — `account_type='asset'`, `is_cash=false`, codes `1296+`.
- **Seed `payment_settlement_clearing` mappings** for each active venue pointing at the matching account above (only when no row exists — never overwrite).
- **Seed `cash_on_hand` mappings** for each active venue pointing at `1020 Cash on Hand` (only when missing).
- Existing per-method `sales_payment_method` rules are **left in place** but no longer used by the new generator (kept so the old generator can be diffed and so user can clean them up later from the UI).

### `rebuild_journal_from_operations()` — sales-summary loop rewrite
For each `(date, venue)` group from `sales_records`:
1. Skip if a journal entry exists for that key and **(`manually_adjusted=true` OR `status='posted'`)**.
2. Resolve venue-scoped accounts:
   - `acc_cash` ← `cash_on_hand|venue` → fallback `payment_method_cash|venue` → fallback `1020 Cash on Hand`.
   - `acc_clearing` ← `payment_settlement_clearing|venue` (no fallback — if missing, mark journal `draft` + `mapping_status='missing'` and continue with the lines we can write).
   - `acc_sales`, `acc_svc`, `acc_disc`, `acc_tips` ← existing per-venue rules (unchanged).
3. Emit lines in this exact order:
   - **Cash** (if non-zero): Dr `acc_cash`, memo `Cash`, `payment_method='cash'`.
   - **Each non-cash method** (`visa, mastercard, amex, union_pay, jcb, alipay, wechat, payme`, plus any other column in `sales_records` resolved generically — see Sales schema in memory) with non-zero amount: Dr `acc_clearing`, memo = method label (`Visa`, `Mastercard`, …), `payment_method = method key`. All four+ method lines share the same `account_id`.
   - **Discount** (if any): Dr `acc_disc`.
   - **Sales (subtotal)**: Cr `acc_sales`.
   - **Service charge**: Cr `acc_svc`.
   - **Card tips**: Cr `acc_tips` (unchanged).
4. After insert, compute `sum(debit)` vs `sum(credit)`; if non-zero, route the residue to the configured suspense account (existing behaviour) and stamp `mapping_status='missing'` on the entry's audit row.
5. Insert one `ledger_audit_log` row per rebuilt entry recording `source_type='sales_summary'`, `entry_id`, `mapping_rule_type` map used, and rebuild trigger.

The invoices / settlements / bank-txn portions of `rebuild_journal_from_operations` are left untouched.

### Posted-journal safety
- The new generator never deletes or rewrites entries where `status='posted'` OR `manually_adjusted=true` (the existing code only checked `manually_adjusted`). Drafts are regenerated as before. Adjustment / reverse-and-regenerate are surfaced in the UI (next section); the backend exposes a separate `reverse_and_regenerate_sales_journal(entry_id uuid)` SECURITY DEFINER helper that:
  1. Marks the original entry `status='void'` and copies it into a new entry with all `debit/credit` swapped (`source_type='adjustment'`).
  2. Calls the sales-summary loop for just that `(date, venue)` to insert a fresh draft.
  3. Writes both actions into `ledger_audit_log`.

## 2. Frontend

### `src/components/finance/RevenueMappingMatrix.tsx`
- **Payment side rewrite**: replace the 9-method × 4-venue grid with a 2-row × N-venue grid:
  - Row 1: **Cash on Hand** (`cash_on_hand|<venue>`), asset accounts.
  - Row 2: **Payment Settlement Clearing** (`payment_settlement_clearing|<venue>`), asset accounts.
  - Caption: "All non-cash methods (Visa, Mastercard, Amex, UnionPay, JCB, Alipay, WeChat, PayMe, Octopus, …) post to this single per-venue account. Each method remains a separate journal line for reconciliation."
- Venue list reads from `useVenues()` (active only) instead of the hard-coded `["Assembly","Caliente","Hanabi","Events"]`.
- Posting-preview block updated to show the new journal shape (Cash → Cash on Hand; Visa → Payment Settlement Clearing; etc.).

### `src/pages/finance/Journal.tsx`
- Show new columns when present: `payment_method`, `source_amount`, `mapping_status` badge (green `Mapped` / amber `Missing mapping → Set mapping`). "Set mapping" deep-links to `/finance/chart-of-accounts?tab=mappings`.
- Add a per-entry action menu for posted entries: **Create adjustment**, **Reverse & regenerate**, **Skip** — each calls the matching RPC.

### `src/hooks/useJournal.ts` / `src/hooks/useSalesData.ts`
- Already trigger `rebuild_journal_from_operations`; no signature change. Add a toast when the RPC returns entries with `mapping_status='missing'`.

### Memory update
- Add a short core line: "Revenue Journal: non-cash payments debit one per-venue Payment Settlement Clearing account; each method stays as its own line. Cash debits Cash on Hand."

## 3. What stays untouched
- `sales_records` schema, the procurement / payroll / settlements journal logic, AR/AP, bank reconciliation, settlement-clearing workflow, P&L and balance-sheet views.
- Existing `Merchant Receivable – <network>` accounts (1220–1280) — no longer used by the new generator but kept so historical journals remain readable. The mapping UI no longer offers them.

## 4. Acceptance
- A fresh rebuild on Assembly produces (in order): Dr Cash on Hand, Dr Payment Settlement Clearing – Assembly (×N for each method), Dr Sales Discounts, Cr Sales, Cr Service Charge, Cr Tips Payable. Total debits = total credits.
- The non-cash debit lines all share `account_id` = the venue's Payment Settlement Clearing account, but each has a distinct `payment_method` and memo.
- No COA name contains "KPAY" after the migration.
- Posted entries from before the migration are untouched. Drafts are regenerated under the new logic.
- A venue with no `payment_settlement_clearing` mapping yields a draft entry stamped `mapping_status='missing'` with a "Set mapping" CTA in the Journal page.

## Out of scope
- Importing settlement files / clearing the new account from bank statements (the settlement workflow already exists and continues to credit clearing accounts — it will be re-pointed to the renamed 1290/1295 automatically because account IDs are preserved).
- Backfilling a `payment_method` column onto historical posted lines.
