## Prompt 1 — Bank module tenant scoping + sidebar restructure (verified)

### Verification done
- **RLS helpers actually in use** (checked `invoices`/`expense_bills`): `is_super_admin(auth.uid())`, `user_has_tenant(auth.uid(), tenant_id)`, `user_has_venue(auth.uid(), venue_id)`. There is no `is_tenant_member` or `is_tenant_admin_or_manager` in this DB — use the real helpers. Bank tables have no `venue_id`, so venue check is omitted.
- **Current `journal_entries.source_type` allowed values** (from live constraint): `sales, sales_summary, invoice, invoice_payment, payroll_accrual, payroll_payment, mpf_payment, settlement_fee, settlement_clearing, bank_fee, bank_txn, manual, adjustment, opening`. New constraint will preserve all 14 and add `bank_transaction`, `expense_bill` (16 total).

### 1. Migration (single idempotent SQL)

**Tenant scoping for `bank_accounts`, `bank_transactions`, `bank_statement_imports`:**
- `ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE`
- `DROP POLICY IF EXISTS` on existing open policies (both SELECT and ALL variants — will drop by name after listing them in the migration)
- Create policies mirroring `invoices` pattern exactly:
  - SELECT: `is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id)`
  - ALL (WITH CHECK): same expression
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`; `GRANT ALL ... TO service_role`

**Column additions:**
- `bank_transactions.source text NOT NULL DEFAULT 'statement' CHECK (source IN ('statement','manual','system'))` — done via `ADD COLUMN IF NOT EXISTS` then `UPDATE ... SET source='manual' WHERE is_manual=true` (backfill runs even if column already existed, guarded by `WHERE source <> 'manual'`)
- `chart_of_accounts.cash_flow_category text CHECK (... IN ('operating','investing','financing'))` nullable, `ADD COLUMN IF NOT EXISTS`

**Constraint changes:**
- `journal_entries_source_type_check`: `DROP CONSTRAINT IF EXISTS` then `ADD CONSTRAINT` with the full list of 16 values above
- `bank_transactions.journal_entry_id` FK: `DROP CONSTRAINT IF EXISTS bank_transactions_journal_entry_id_fkey` then `ADD CONSTRAINT ... FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL`

All wrapped in `DO $$ ... $$` blocks where needed for idempotency.

### 2. `src/hooks/useBankModule.ts`

- Pass `tenantId` as 4th arg to `fetchAllRows` for: `bank_accounts`, `bank_transactions`, `bank_statement_imports`, `bank_recon_rules`, `bank_fx_rates`, `bank_transaction_matches`
- Leave `chart_of_accounts` and `journal_lines` unchanged (no tenant_id column)
- `saveAccount` insert: add `tenant_id: tenantId`
- Gate `load()` on `tenantId` presence (early-return + include `tenantId` in `useCallback` deps and `useEffect`)

### 3. `src/components/AppSidebar.tsx`

- Replace flat `bankItems` render with:
  - Standalone: **Dashboard** → `/bank/dashboard`
  - `CollapsibleNavGroup` sections (Procurement/Expenses pattern):
    - **ACCOUNTS** — Bank Accounts, Transfers, FX & Multi-Currency
    - **TRANSACTIONS** — All Transactions, Incoming, Outgoing
    - **RECONCILIATION** — Reconciliation, Payment Matching, Rules
    - **REPORTING** — Bank Fees
- Remove the single "Bank Reconciliation" object from `financeItems` (line 43); leave rest intact

### 4. `src/App.tsx`

- Remove import + route: `BankReconciliation` (`/finance/bank-reconciliation`)
- Remove import + route: `UnmatchedTransactionsPage` (`/bank/unmatched`)
- Leave page files on disk; leave `/bank/reconciliation` → `BankReconciliationPage`

### Out of scope
No page-level UI changes; no page-file deletion.
