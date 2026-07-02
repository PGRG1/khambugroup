# Petty Cash Module

Standalone top-level section for managing physical cash floats per venue, informal receipts, and replenishments. Posts to GL via classification layer. No changes to Expenses, Procurement, Bank, or Finance.

## 1. Database migration (single idempotent file)

Four new tables in `public`, all tenant-scoped with RLS matching the `invoices` pattern (`user_has_tenant` for SELECT; admin/manager for write). GRANT SELECT/INSERT/UPDATE/DELETE to `authenticated`, ALL to `service_role`.

- **`petty_cash_floats`** — name, venue, gl_account_id → `chart_of_accounts`, float_amount (default 2000), replenish_threshold (default 500), is_active, notes. UNIQUE (tenant_id, name).
- **`petty_cash_classifications`** — name, financial_type CHECK in (cogs/opex/asset/other), gl_account_id, color (default `#888780`), sort_order, is_active. UNIQUE (tenant_id, name).
- **`petty_cash_receipts`** — float_id, receipt_date, amount (>0), description, classification_id, receipt_url, receipt_path, status CHECK in (pending/approved/rejected/posted) default 'pending', notes, created_by, approved_by, approved_at, journal_entry_id, updated_at trigger.
- **`petty_cash_replenishments`** — float_id, replenishment_date, amount (>0), from_bank_account_id, reference, notes, journal_entry_id, created_by.

Storage bucket `petty-cash-receipts` (private) via `supabase--storage_create_bucket`, plus RLS on `storage.objects` allowing authenticated users to upload/read under paths beginning `{auth.uid()}/…`.

## 2. Hook — `src/hooks/usePettyCash.ts`

Uses `useActiveTenant`. `load()` early-returns without tenantId. Parallel fetch of the 4 petty-cash tables (tenant-filtered) plus `chart_of_accounts` (id/code/name/account_type) and `bank_accounts` (id/account_name/currency). Exposes `floats, classifications, receipts, replenishments, coa, bankAccounts, loading, tenantId, reload`, plus `currentBalanceFor(floatId)` = float_amount − Σ approved|posted receipts + Σ replenishments.

## 3. Sidebar — `src/components/AppSidebar.tsx`

Extend `GroupKey` union with `"pettycash"`, default open in `loadGroupState`. New `CollapsibleNavGroup groupKey="pettycash"` labelled **Petty Cash**, gated by `showFinance`, positioned between Payments and Bank. Standalone `Overview → /petty-cash` (Wallet icon) above two labelled sub-groups:

- MASTER DATA — Floats (`Archive`), Classifications (`Tag`)
- TRANSACTIONS — Receipts (`Receipt`), Replenishments (`RefreshCw`)

## 4. Routes — `src/App.tsx`

Five admin-protected routes: `/petty-cash`, `/petty-cash/floats`, `/petty-cash/classifications`, `/petty-cash/receipts`, `/petty-cash/replenishments`.

## 5. Pages (all under `src/pages/petty-cash/`)

Shared conventions: `card-glass`, `text-2xl font-display font-semibold` titles, amber underline tabs, `text-[11px] uppercase tracking-wider bg-muted/40` table headers, `bg-muted/30` alternating rows, `text-right tabular-nums font-mono` numbers, `sonner` toasts, `tenantId` from `usePettyCash`.

- **PettyCashOverviewPage** — venue filter + Add receipt CTA · 4 KPIs (Total float / Current balance / Spent this month / Pending approval) · float cards grid (auto-fill 240px min) with health-coloured left border + progress bar + contextual CTA + dashed `+` card · Recent receipts (last 8) and This-month-by-classification panels.
- **PettyCashFloatsPage** — grid of float cards with key-value details + Edit/Replenish. Add/Edit Sheet: Name, Venue Select from distinct venues (+Other free text), Target, Threshold, GL Account (Select coa where `account_type='asset'`), Notes, Active.
- **PettyCashClassificationsPage** — info banner explaining GL flow · table (Colour dot / Name / Type badge / GL account / P&L impact text / Active toggle / Edit-Delete). Compact dialog for add/edit. Delete blocked if any receipt references the classification. Empty-state "Seed defaults" button inserts the 7 default classifications (Food/Bev/Supplies/Service/Goods/Maintenance/Equipment) with GL accounts null. **The seed defaults insert must include `tenant_id: tenantId` on every row — never insert without it.**
- **PettyCashReceiptsPage** — float + status filters. Always-visible quick add: Date/Float/Amount/Description row, visual card grid for classification picker (selected = amber border/tint), receipt photo upload zone (uploads to `petty-cash-receipts/{tenantId}/{floatId}/{uuid}.{ext}`), notes textarea, Save / Save & add another. List with status colouring (pending amber left border, posted purple), Approve/Reject on pending, Post on approved (creates JE Dr classification.gl / Cr float.gl, **`source_type: 'petty_cash'` and `source_id: receipt.id`** so Finance can drill back to the source receipt; then links `journal_entry_id` and flips status to posted), receipt photo lightbox.
- **PettyCashReplenishmentsPage** — 3 KPIs (This month / By float count / Last date). Add Sheet with Float, Date, Amount (pre-filled to float_amount − currentBalance), From bank account, Reference, Notes. On save inserts row and creates JE Dr float.gl / Cr bank_account.linked_gl_account_id, **`source_type: 'petty_cash_replenishment'` and `source_id: replenishment.id`** so Finance can drill back to the replenishment; links journal entry. Table: Date / Float / From account / Reference / Amount (emerald) / Journal badge / View action.

## 6. Out of scope
No changes to Expenses, Procurement, Bank, Finance, or existing pages beyond the two files above.
