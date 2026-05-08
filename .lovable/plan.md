## Bank Reconciliation — First Working Version

Build on the existing `src/pages/finance/BankReconciliation.tsx`. Keep the current header, account selector, KPI grid, tabs, and Bank Account Master table. Layer in real functionality: PDF statement upload, multi-account extraction, transaction recognition, mapping, and review.

### 1. Empty state fix (KPI cards & status)

In `BankReconciliation.tsx`:
- Detect `hasAnyStatement = imports.length > 0` and `hasFilteredTxns = filteredTxns.length > 0`.
- When no statement exists for the current selection, render `—` for Statement Balance, Ledger Balance, Difference, Matched, Unmatched, Needs Review.
- Replace the "Reconciled" chip with `No Statement Uploaded` (chip-neutral) until at least one statement import exists.
- When `accounts.length === 0`, show a top-level alert card: *"No bank accounts added yet. Add a bank account or upload a statement to begin."* with an inline **Add Account** button.

### 2. Bank Account Master tab (already structurally present)

- Add missing columns: **Account Type** (e.g. Current / Savings / Foreign Currency Savings).
- Account editor modal already exists; extend with: Account Type select, Notes textarea (already present), Opening balance, Opening balance date.
- Seed three suggested example accounts via the "Add Account" modal (no auto-insert) — BOCHK HKD Current (5027), BOCHK HKD Savings (5001), BOCHK CNY Savings (5014). User confirms.

Schema migration:
```sql
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'current';
```

### 3. Statement upload + extraction (Edge Function)

New edge function `supabase/functions/parse-bank-statement/index.ts`:
- Accepts a PDF file (multipart) or a base64 payload + filename.
- Stores the PDF in storage bucket `bank-statements` (new, private).
- Calls Lovable AI Gateway (`google/gemini-2.5-pro`) with the PDF inline to extract a strict JSON schema:
  ```
  {
    bank_name, company_name, statement_date, currency_summary[],
    accounts: [{
      account_type, account_number, currency,
      opening_balance, closing_balance,
      total_deposits, total_withdrawals,
      deposit_count, withdrawal_count,
      transactions: [{
        txn_date, value_date, raw_description, cleaned_counterparty,
        reference, deposit, withdrawal, running_balance, source_page
      }]
    }]
  }
  ```
- Validates with Zod and returns parsed JSON to the client (no DB write yet — preview first).

Client-side: replace placeholder `StatementUpload` body with a 3-step flow:
1. **Upload** PDF → call edge function → show progress.
2. **Preview & map accounts**: list each detected account (type / last4 / currency / opening / closing). For each, dropdown to map to an existing `bank_accounts` row OR "Create new" (opens inline form pre-filled with detected values). Mapping persists in a new `bank_statement_account_mappings` table keyed by `(bank, account_number_last4) → bank_account_id`.
3. **Confirm** → write `bank_statement_imports` (one per detected account) + bulk-insert `bank_transactions`.

Schema migrations:
```sql
CREATE TABLE public.bank_statement_account_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL,
  account_number_last4 text NOT NULL,
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_name, account_number_last4)
);
ALTER TABLE public.bank_statement_account_mappings ENABLE ROW LEVEL SECURITY;
-- read for authenticated, manage for admin/manager (mirror existing patterns)

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS value_date date,
  ADD COLUMN IF NOT EXISTS counterparty text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_page integer,
  ADD COLUMN IF NOT EXISTS suggested_type text,
  ADD COLUMN IF NOT EXISTS suggested_category text,
  ADD COLUMN IF NOT EXISTS suggested_match_id text,
  ADD COLUMN IF NOT EXISTS extraction_confidence numeric;

-- private storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('bank-statements', 'bank-statements', false)
  ON CONFLICT DO NOTHING;
```
RLS for the bucket: read/write restricted to admin + manager.

### 4. Transaction recognition rules

New `src/utils/bankTxnRules.ts` with a pure function `classifyTxn(description, money_in, money_out) → { suggested_type, suggested_category }`. Patterns (case-insensitive):
- `KPAY MERCHANT SERVICE LIMITED` → `kpay_settlement`
- `FPS OUT FEE` → `bank_fee` / `Bank Charges`
- `FPS/...` (deposit) → `customer_receipt`; (withdrawal with counterparty) → `supplier_payment`
- `CBS TRANSFER` → `internal_transfer`
- `FPS RTN`, ` RTN`, ` CORR` → `reversal`
- `ATM DEP`, `CDM DEP` → `cash_deposit`
- `JP-GAS` → `utility_payment` / `Utilities - Gas`
- `JP-WSD` → `utility_payment` / `Utilities - Water`
- `Interest` (line type) → `interest_income`

Applied (a) at extraction commit time, populating `suggested_type` / `suggested_category`, and (b) live in the UI via the same util when displaying the Transactions tab.

A second new table holds user-defined rules for the **Rules tab**:
```sql
CREATE TABLE public.bank_recon_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  match_contains text NOT NULL,
  suggested_type text NOT NULL,
  suggested_category text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
```
User rules merge with built-ins (built-ins seeded via UI, not DB).

### 5. Tabs build-out

Enable previously-disabled tabs and back each with a focused component file under `src/components/finance/bank-recon/`:

- **Suggested Matches** — `SuggestedMatchesTab.tsx`: lists `bank_transactions` where `suggested_match_id IS NOT NULL` and `status IN ('suggested','partial')`. Columns: bank line, suggested source, type, amount diff, date diff, confidence, Confirm/Reject.
- **KPay** — `KPayTab.tsx`: filters by `suggested_type='kpay_settlement'`. Lists candidate matches from `payment_method_settlements` / daily sales (KPay) join. Reminder: venue allocation comes from source records, not the bank line.
- **Cash Deposits** — filters `cash_deposit` against Cash on Hand records.
- **Supplier Payments** — filters `supplier_payment`/`bank_fee` excluded; matches against `invoices` by counterparty + amount.
- **Transfers** — pairs `internal_transfer` lines across two `bank_accounts` (same date ±2 days, opposite sign, equal amount).
- **Unmatched** — groups `status='unmatched'` by suggested issue.
- **Journals** — lists `journal_entries` where `source_type='bank_recon'`; deep-links to the originating bank line.
- **Rules** — CRUD for `bank_recon_rules`.
- **Audit** — reads `bank_audit_trail`; writes from all status changes.
- **Period Close** — per account+period checklist; "Lock Period" inserts/updates `bank_reconciliation_periods` with `status='locked'`.

Each tab is gated: shows a friendly empty state until data exists.

### 6. Match / Review side panel

Replace the placeholder Sheet body with a richer panel (still in the existing `Sheet`):
- Header: cleaned date, amount (colored), status chip.
- Sections: Raw description, Cleaned details, Source PDF page (link opens signed URL to the stored PDF, anchored to page), Suggested type, Suggested match (with diff), Confidence reason, Related source records, Notes textarea, Audit history (from `bank_audit_trail`).
- Action bar (buttons): Confirm match / Reject / Search source records (opens a small command palette over `invoices`, `payments`, `daily_sales`) / Manually match / Split match / Create journal / Mark internal transfer / Mark reversal / Mark bank fee / Mark cash deposit / Mark needs review / Ignore with reason.
- Each action writes a row into `bank_audit_trail` (existing table) and updates the bank line.

### 7. Reconciliation summary logic

In `useBankReconciliation`, expand to compute per-account, per-period:
- statement closing balance (latest `bank_statement_imports`)
- ledger balance (existing)
- difference, matched / unmatched / needs-review counts, txn count
- status from logic table:
  - no imports → `No Statement Uploaded`
  - import exists but >0 unmatched and matched=0 → `Imported`
  - some matched + open items → `In Review`
  - matched but |diff| > 0.01 → `Partially Reconciled`
  - all matched + |diff| < 0.01 → `Reconciled`
  - locked period exists → `Locked`

KPIs and the Overview table consume these.

### 8. Acceptance criteria mapping

All 13 acceptance items in the request are addressed by the items above (empty state, account CRUD, PDF upload, extraction, multi-account split, mapping, transactions tab, rule recognition, manual review, source-record matching, summary updates, audit trail, no venue requirement on bank lines).

### Technical notes

- Edge function uses `LOVABLE_API_KEY` (already provisioned) → no new secret prompt.
- BOCHK PDF parsed earlier confirms shape: 3 accounts (HKD Savings 5001, HKD Current 5027, FCY/CNY Savings 5014), transaction rows include `Transaction Date`, `Value/Effective Date`, `Transaction Details`, `Deposit`, `Withdrawal`, `Balance`. Extractor will split on the per-account headings (`HKD Savings (012-...-5001)`, `HKD Current (...-5027)`, `Foreign Currency Savings (...-5014)`).
- Storage bucket is private; PDF preview links use short-lived signed URLs.
- All new components follow `card-glass`, `chip-*`, `td-num`, `formatCurrency`, `formatDate` per project memory.

### Files to add / modify

- modify: `src/pages/finance/BankReconciliation.tsx`, `src/hooks/useBankReconciliation.ts`
- add: `src/utils/bankTxnRules.ts`
- add: `src/components/finance/bank-recon/{SuggestedMatchesTab,KPayTab,CashDepositsTab,SupplierPaymentsTab,TransfersTab,UnmatchedTab,JournalsTab,RulesTab,AuditTab,PeriodCloseTab,StatementUploadFlow,TransactionReviewPanel}.tsx`
- add: `supabase/functions/parse-bank-statement/index.ts`
- migration: column additions, two new tables, storage bucket + RLS

### Out of scope (to confirm explicitly later)

- Auto-creating journals for bank fees / interest (button present but writes a draft journal only).
- OCR of scanned (non-text) PDFs — relies on Gemini's vision capability already available.
- CSV/OFX import — only PDF in this iteration.
