## Plan — Bank Dashboard & Transactions Rewrite

Rewrite two pages end-to-end using existing `BankShell` primitives and `useBankModule` (which already provides `tenantId`, accounts, transactions, imports, coa, and mutations). No hook changes.

### Shared source badge helper (colocated in each page)

- If `source === 'manual'` OR (`source` is null/undefined AND `is_manual === true`) → purple "Manual".
- Else if `source === 'system'` → teal "System".
- Else (including `source === null`, `source === 'statement'`, or anything else) → sky "Statement".

Null `source` is expected on pre-migration rows: fall back to `is_manual` first, then default to "Statement". Never infer System from `is_manual` — `is_manual` means manual entry only. Pre-migration transfers/system rows will surface as "Manual" until re-touched, which is the intended behavior.

### System unconfirmed condition (KPI + row badge)

Strictly: `t.source === 'system' && !['matched','cleared','approved','posted'].includes(t.status)`. Do not include `is_manual`-based inference. Only rows explicitly written with `source: 'system'` going forward qualify.

### 1. `src/pages/bank/BankDashboard.tsx` (full rewrite)

**Header**: `BankPageShell` title "Bank", subtitle "Cash position as of last statement upload.", right-slot venue filter `Select` derived from `Array.from(new Set(accounts.map(a => a.venue).filter(Boolean)))`.

**KPI row (4× `BankKpi`)**:
- Total system cash — `accounts.reduce((s,a) => s + currentBalanceFor(a.id), 0)` — amber.
- Unmatched — `transactions.filter(t => !t.matched_record_id && ['unmatched','pending','imported'].includes(t.status)).length` — amber if > 0.
- Accounts needing upload — count accounts where no import exists OR latest `period_end` > 30 days ago — red if > 0.
- Pending confirmation — System-unconfirmed condition above — sky.

**Account grid** (`grid grid-cols-3 gap-4`): one `card-glass` per account with left border `border-l-2 rounded-none` colored by freshness (≤7d emerald / 8–30d amber / >30d or none red). Content: name (bold), `bank_name · currency` muted, big `tabular-nums font-mono` balance from `currentBalanceFor`, "System balance" 10px muted label, freshness line ("Last import DD MMM YYYY · N days ago" or "Never reconciled" in red), full-width action button — fresh: ghost "View transactions" → `/bank/transactions`; stale/none: amber outline "Upload statement" → `/bank/reconciliation`.

**Bottom two panels** (`grid grid-cols-2 gap-4`):

*Left — Action queue* (card-glass): 4 clickable rows always visible (muted when count=0), each with label / sub-label / right chevron:
1. Stale accounts → `/bank/reconciliation` (sub: "Most overdue: {name} · N days").
2. Unmatched transactions → `/bank/matching` (sub: "Oldest: {date}").
3. Low confidence — count of txns with low `match_confidence` and no `matched_record_id` → `/bank/matching`.
4. System unconfirmed → `/bank/transactions`.

*Right — Recent activity* (card-glass): top 8 by `txn_date desc`. Columns: Date, Description (truncate 28), Source badge (via helper), In (emerald), Out (red). Amounts blank when 0. Bottom-right "View all →" link → `/bank/transactions`.

### 2. `src/pages/bank/BankTransactionsPage.tsx` (full rewrite)

Reuses `useBankModule` unchanged: `transactions`, `accounts`, `coa`, `createManualTxn`, `updateTxn`, `tenantId`.

**Header**: title "Transactions", subtitle "Complete ledger across all accounts.". Right actions:
- "Upload statement" (primary) → `/bank/reconciliation`.
- "Add manual" (outline) → `Dialog` with fields: Account (Select from `accounts`), Date, Description, Reference, Direction radio (Money in / Money out), Amount (numeric), Notes, GL Account (Select from `coa.filter(a => a.is_active)`). Submit: `createManualTxn({ ..., source: 'manual', is_manual: true, tenant_id: tenantId, money_in/money_out based on direction })`, toast via sonner, close.

**KPIs (4× `BankKpi`)**: Showing N (filtered count), Inflow (emerald sum of money_in), Outflow (red sum of money_out), Unmatched (amber if >0).

**Filter bar** (card-glass): search (description/reference contains), Account Select, Source Select (All/Statement/Manual/System — filter uses same helper logic), Status Select (dynamic from data), Date from / Date to. "Clear filters" text button when any non-default is set.

**Table** columns: Date, Account, Description, Source badge, In (emerald, blank if 0), Out (red, blank if 0), Status badge, GL Account (resolved from `category_account_id`).

Header style: `text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40`. Even rows `bg-muted/30`. Number cells `text-right tabular-nums font-mono`.

**Row border rules**:
- Unmatched or system-unconfirmed → `border-l-2 border-amber-400 rounded-none`.
- Cleared → `border-l-2 border-emerald-500/30 rounded-none`.

**Status badges**: unmatched amber, imported muted, classified sky, matched emerald, cleared strong emerald, split purple. Overlay: system-unconfirmed condition renders amber "Unconfirmed" instead of base status.

**Expandable inline row**: single-open via `expandedId`; clicking same row toggles, different row swaps. Panel (full colspan, muted bg):
- Value date, Currency (read-only).
- If `suggested_category`: label + "Accept" button → `updateTxn(id, { category_account_id: <resolved coa id>, status: 'classified' })`.
- Confidence badge from `match_confidence`.
- Notes `Textarea` — `onBlur` → `updateTxn(id, { notes })`.
- GL Account `Select` from active coa — `onChange` → `updateTxn(id, { category_account_id })`.
- If `matched_record_id`: read-only "Matched: {matched_type} · {matched_reference}".

### Conventions
- All toasts via `sonner`.
- No `useActiveTenant` calls in either page — `tenantId` comes from `useBankModule`.
- Formatting via `@/utils/format` / existing `fmtMoney` / `fmtDate` from `BankShell`.
- No hardcoded color hex values — use existing tokens/utility classes.

### Files touched
- `src/pages/bank/BankDashboard.tsx` — rewrite.
- `src/pages/bank/BankTransactionsPage.tsx` — rewrite.

No DB migrations, no `useBankModule` edits, no sidebar/route changes.
