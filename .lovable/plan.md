# Setup-driven Account Mapping — Investigation & Plan

## 1. Current state

### `account_mapping_rules` schema
Columns: `id, tenant_id, rule_type text, match_key text (NOT NULL, "" = default), account_id uuid, notes, created_at, updated_at`. Unique on `(tenant_id, rule_type, match_key)`. No provenance / "manually overridden" flag today.

### Rules currently in use (KHAMBU tenant)
Grouped by consumer expectation:

| rule_type | match_key format | count | consumer expects |
|---|---|---|---|
| `sales_revenue` | venue name | 5 | per-venue |
| `service_charge` | venue name | 5 | per-venue |
| `sales_discount` | venue name | 5 | per-venue |
| `tips_payable` | venue name | 5 | per-venue |
| `cash_on_hand` | venue name | 5 | per-venue (with fallbacks: `cash_clearing`/venue, then `sales_payment_method`/`cash__venue`, then COA code 1020) |
| `payment_settlement_clearing` | venue name | 4 | per-venue (no fallback → sales fall to `suspense` if missing) |
| `sales_payment_method` | `method__venue` (also legacy bare `cash`) | 29 | per (method, venue) — LEGACY: not read by current rebuild path except as fallback for cash |
| `suspense` | `__default__` (any) | 1 | single tenant default |
| `accounts_payable` | "" | 1 | single default |
| `procurement_category` | `financial_treatment__level1_category` | 6 | per-classification, joined via COALESCE(pm.default_coa_account_id, amr.account_id) |
| `invoice_discount`, `invoice_refund` | "" | 1 each | single default |
| `payment_method_cash` | payment_method key (cash/cheque/bank_transfer/…) | 4 | invoice/payroll cash-side |
| `payroll_salary_expense`, `payroll_mpf_expense`, `salary_payable`, `mpf_payable`, `opening_equity`, `sales_cash` | "" | 1 each | single default |
| `bank_txn_type` | txn type (`bank_fee`) | 1 | classifier |

Additional rule_types the current rebuild function looks up but that don't have rows yet: `cash_payment_clearing`, `processor_fee_default`, `bank_transfer_fee_default`, `bank_payment_clearing` (method key), `processor_fee`, `cash_clearing`.

### Consumers
All consumers are **DB functions** (no edge function or client reads `account_mapping_rules` for posting). Client references are only in `useAccountMapping` (admin CRUD) and `AccountingMappingSummary` / `useUnmappedVenues` (display).
Primary consumer: `_rebuild_journal_from_operations_impl` (migration `20260711040711…`). Also: procurement/invoice posting, expense-bill posting, payroll posting, opening balances, reconciliation classifier. `cascade_venue_rename` rewrites `match_key` when a venue is renamed.

### Setup sources of truth (to generate FROM)
- **Venues**: `venues (tenant_id, name, is_active, sort_order)` — canonical list per tenant. `match_key` uses venue **name** (not id) — cascade already handles renames.
- **Payment methods**: **no dedicated table**. Enumerated in `RULE_TYPES` UI (`useAccountMapping.ts`) and hard-coded across the app (`AccountingMappingSummary.PAYMENT_METHODS`: cash, visa, mastercard, amex, union_pay, jcb, alipay, wechat, payme). No `enabled` flag anywhere. **Gap** — see §"Decisions needed".
- **Chart of Accounts**: `chart_of_accounts (code, name, account_type, normal_side, is_cash, is_active, cash_flow_category, tenant_id)`. **No `role` / `semantic_key` column exists.** Only structural fields (`account_type`, `is_cash`). Today the connection between a rule and its account is entirely human-picked. This is the crux issue.

## 2. Proposed generation model

### 2a. Give COA accounts a semantic role
Add `chart_of_accounts.account_role text` (nullable, indexed). It tags accounts with generator-known roles:

- Scalar roles (one per tenant): `suspense`, `accounts_payable`, `salary_payable`, `mpf_payable`, `payroll_salary_expense`, `payroll_mpf_expense`, `opening_equity`, `invoice_discount`, `invoice_refund`, `cash_payment_clearing`, `bank_transfer_fee_default`, `processor_fee_default`.
- Per-venue roles (one per venue): `sales_revenue`, `service_charge`, `sales_discount`, `tips_payable`, `cash_on_hand`, `payment_settlement_clearing`. Linked with an additional nullable `venue_id uuid` FK on `chart_of_accounts` — one row per (role, venue).
- Per-payment-method role: `merchant_receivable` with `payment_method text` on the COA row (visa → 1220, mastercard → 1220, …). Used later if we split clearing per method; today rebuild uses one clearing per venue so this stays informational.

Alternative rejected: code-prefix conventions (4xxx → sales). Too brittle across tenants that may reorder the COA.

### 2b. Generator rules (per `rule_type`)
Given tenant venues V (active) + payment methods M (from a new `enabled_payment_methods` config, §"Decisions needed") + COA tagged with roles:

| rule_type | generated key(s) | account resolved by |
|---|---|---|
| `sales_revenue`/`service_charge`/`sales_discount`/`tips_payable`/`cash_on_hand`/`payment_settlement_clearing` | one row per venue name in V | COA where `account_role=<rule>` AND `venue_id = v.id` |
| `sales_payment_method` | `method__venue` per (M × V) | COA where `account_role='merchant_receivable' AND payment_method=method`, or fall back to per-venue `payment_settlement_clearing` (matches current rebuild behavior) |
| `payment_method_cash` | one row per M where method is cash-like (cash/cheque/bank_transfer) | COA scalar role `cash_payment_clearing` |
| scalar rule_types | single row, match_key="" | COA row with matching `account_role` |
| `procurement_category` | one row per (financial_treatment × level1_category) actually used by `product_master` | **not generatable** — needs human pick; keep manual, flag missing combos as "unmapped" in the sync review |
| `bank_txn_type` | leave manual; managed by reconciliation rules feature |

If a role has no tagged COA account, the generator emits a **"missing role"** finding — it never invents/guesses an account.

### 2c. Automatic vs button — recommendation: **manual Sync with a diff preview**

Trigger auto-regen on venue/COA changes is tempting but risky: silent regeneration could clobber a hand-tuned mapping mid-quarter and change what the rebuild posts on the next tick.

**Recommended flow** on `Finance → Chart of Accounts → Account Mappings`:
1. "Sync mappings from setup" button runs a **dry-run** RPC `preview_mapping_sync(tenant_id) → jsonb` returning three buckets:
   - **To add** (setup expects a rule that doesn't exist)
   - **To retarget** (rule exists but points at a different account than the tagged COA account — only shown for rules whose provenance is `generated`)
   - **Orphan** (rule references a venue/method no longer in setup)
   - **Blocked** (missing role tag on COA — human must tag first)
2. Admin reviews and clicks Apply → `apply_mapping_sync(tenant_id, jsonb)` performs the diff transactionally, writes a `ledger_audit_log` entry, and enqueues a `pending_rebuilds` row.
3. Lightweight auto-trigger: on `INSERT` of a venue, auto-add the generated rules for that venue only (never touches existing rules). On venue soft-delete (`is_active=false`), mark related rules as orphan candidates for next Sync — do **not** delete.

### 2d. Preserving manual overrides
Add `account_mapping_rules.provenance text` (nullable) with values:
- `generated` — created by Sync; Sync may retarget or delete.
- `manual` — hand-set; Sync **never** overwrites; only shows an advisory diff if it disagrees with the tagged role.

Migration: mark every existing row `manual` (see §3). Also add `account_mapping_rules.locked boolean default false` so an admin can promote a `generated` row to protected without changing provenance semantics.

## 3. Migration & safety

### 3a. Migration steps (non-destructive)
1. Add columns: `chart_of_accounts.account_role`, `chart_of_accounts.venue_id`, `chart_of_accounts.payment_method`; `account_mapping_rules.provenance`, `account_mapping_rules.locked`.
2. **Backfill role tags for KHAMBU** by matching existing rules → their pointed-at COA account. For each rule, set `chart_of_accounts.account_role/venue_id/payment_method` to the values implied by the rule that already targets it. Because the KHAMBU rules are correct today (after the recent cleanup), this makes the tagged COA a mirror of today's mapping.
3. Mark every existing `account_mapping_rules` row as `provenance='manual'` — Sync will not touch them until an admin flips them to `generated` (or wipes them).
4. Ship the generator + preview + apply RPCs but do NOT auto-run on migrate. First run is admin-initiated in the UI.
5. Add missing payment-methods table (see decisions). Until then, generator reads the hard-coded list.

### 3b. Verification before we trust the switch
- On the KHAMBU tenant, run `preview_mapping_sync` after backfill: **expect zero "to retarget" rows** for any rule where the pointed-at account already has a role tag. Any diff = a role tag was wrong, fix in step 2 before proceeding.
- Snapshot `journal_lines` for the last 90 days to a temp table. Run `rebuild_journal_from_operations` before and after enabling the new flow. Compare `SUM(debit), SUM(credit)` grouped by `(source_type, entry_date, account_id)` — must be identical.
- Fill Hanabi's missing `payment_settlement_clearing` gap via Sync (this is one of the concrete bugs the user cited) and re-run the diff.

### 3c. Risk list
- **Wrong role tag → wrong retarget.** If backfill assigns the wrong role to an account, next Sync could silently retarget a generated rule. Mitigated by: initial provenance=`manual` on all rules (Sync no-op until human opts in), audit log on every apply.
- **`match_key` format drift.** `sales_payment_method` uses `method__venue`; consumer expects that exact separator. Generator must produce the identical string.
- **Venue rename.** Existing `cascade_venue_rename` rewrites match_key. Generator uses venue name too, so behavior stays consistent — but if we later switch generator to venue **id**, we must update the consumer and the cascade in the same change.
- **Legacy bare-key rules** (e.g. `sales_payment_method` `cash`, or the historical bare `visa`) — Sync's "orphan" bucket will flag them so the admin can prune them explicitly.
- **`procurement_category`** is not generatable — the UI must keep manual editing for it.
- **Multiple tenants** — KHAMBU test-tenant `52cd684c…` has only 5 rules and no chart of accounts entries tagged. Sync there will report "blocked: no roles tagged" and do nothing, which is correct.

## 4. Decisions I need from you before building

1. **`account_role` on chart_of_accounts** — OK to add role/venue_id/payment_method columns, or do you want a separate `chart_of_accounts_roles` table? (Simpler = add columns.)
2. **Payment methods source of truth** — today it's a hard-coded list. Options: (a) keep hard-coded and generate from it, (b) add a `payment_methods (tenant_id, key, label, is_enabled, is_cash_like)` config table now. Recommend (b) because "adding a payment method" is exactly the setup change that should ripple into mappings.
3. **Cash mapping model** — today `cash_on_hand`/venue is the primary. Do we keep that OR switch fully to `sales_payment_method` `cash__venue`? Recommend keeping current model to keep the rebuild function untouched.
4. **Sync on venue add: auto-add rules for that venue silently, or always require button?** Recommend silent add (only additive, never mutative), matching how new-venue setup already scaffolds records elsewhere.
5. **Who can run Sync?** Platform-admin only, or any tenant admin? (Affects the RPC's SECURITY DEFINER + role checks.)

No files will be changed until you approve this plan and answer the 5 decisions above.
