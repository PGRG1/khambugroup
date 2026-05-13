## Plan: Reconciliation Mapping Rules

Create a new master table that drives classification + match suggestions for Bank Transactions. No journal posting in this step.

### 1. Database

New table `reconciliation_mapping_rules`:

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| rule_name | text | required, unique |
| bank_description_contains | text | case-insensitive match key |
| bank_movement | text | enum: `money_in` \| `money_out` \| `either` |
| counterparty_type | text | free text (Payment Processor, Bank, Supplier, Cash, Internal Bank Account, Payroll, Supplier / Employee / Other) |
| classification | text | e.g. Merchant Settlement, Bank Fee, Supplier Payment… |
| match_to | text | e.g. KPay Report / Merchant Clearing, Supplier Invoice / AP… |
| source_required | boolean | default false |
| debit_account | text | label for now (string, not FK) |
| credit_account | text | label for now (string, not FK) |
| review_required | boolean | default true |
| auto_post | boolean | default false |
| is_active | boolean | default true |
| sort_order | int | default 0 |
| created_at / updated_at | timestamptz | with trigger |

RLS: read = authenticated; manage = admin OR manager (matches `bank_recon_rules`).

Seed the 9 initial rules from the spec.

### 2. Suggestion engine (frontend, no posting)

Add `src/utils/reconciliationMappingRules.ts`:
- `loadRules()` — fetch active rules.
- `matchRule(txn, rules)` — first rule where:
  - `bank_description_contains` is found (case-insensitive) in `description`, AND
  - `bank_movement` matches `money_in` (>0) / `money_out` (>0) / `either`.
- Returns `{ rule_name, classification, match_to, suggested_type, suggested_category, debit_account, credit_account, review_required, auto_post, source_required }`.

### 3. Wire into Bank Transactions

- In `StatementUploadFlow` commit step and in `TransactionReviewPanel` live render: run `matchRule` first, fall back to existing `classifyTxn` / AI suggestion (`ai-classify` edge function) only when no rule matches.
- Persist into existing `bank_transactions` columns (`suggested_type`, `suggested_category`, `notes`) — no schema change to bank_transactions.
- Display rule name + classification + match-to + accounts in the review panel as a "Suggested Mapping" block. User must approve; no auto-posting yet (`auto_post` is stored but ignored at this stage).

### 4. Out of scope (explicit)

- No journal_lines / journal_entries writes.
- No KPay matching engine changes — only surface "Match To: KPay Report / Merchant Clearing" hint; existing KPay matching tab keeps working unchanged.
- No admin UI for editing the rules in this step (rules are seeded; CRUD UI can come next). If you'd like me to also build the management screen now, say so.

### Files touched

- new migration: create table + RLS + seed
- new `src/utils/reconciliationMappingRules.ts`
- edit `src/components/finance/bank-recon/StatementUploadFlow.tsx`
- edit `src/components/finance/bank-recon/TransactionReviewPanel.tsx`
