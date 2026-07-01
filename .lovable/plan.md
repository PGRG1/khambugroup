## Plan — Prompt 3: Reconciliation Page

### 1. Copy 6 files into `src/components/bank/recon/`

Copy verbatim from `src/components/finance/bank-recon/` (originals stay in place):
- `StatementUploadFlow.tsx`
- `TransactionReviewPanel.tsx`
- `MappingRulesTab.tsx`
- `RulesTab.tsx`
- `AuditTab.tsx`
- `FilteredTxnList.tsx`

In each copy: swap `import type { BankAccount, BankTxn, StatementImport } from "@/hooks/useBankReconciliation"` → `from "@/hooks/useBankModule"`. No other logic changes.

### 2. Tenant-scope the copied `StatementUploadFlow`

Extend props interface with `tenantId: string | null`. Include `tenant_id: tenantId` on every insert path that writes tenant-owned rows:
- `supabase.from("bank_statement_imports").insert({ ..., tenant_id: tenantId })`
- `supabase.from("bank_transactions").insert(chunk)` — map each row to include `tenant_id: tenantId` before batch insert.
- `supabase.from("bank_accounts").insert({ ..., tenant_id: tenantId })` on the "create new account" branch — prevents a NOT NULL constraint error when a fresh account is created during upload for KHAMBU or any tenant.

Do not touch `bank_audit_trail` or `bank_statement_account_mappings` inserts — outside the prompt's scope.

### 3. Rewrite `src/pages/bank/BankReconciliationPage.tsx`

Imports only from `@/hooks/useBankModule` and `src/components/bank/recon/*`. Never import from `useBankReconciliation`. `tenantId` comes from `useBankModule`.

**Header** (`BankPageShell`): title "Reconciliation", subtitle "Upload statements, match transactions, and close periods." Right actions row:
- Account `Select` from `accounts` (label: `account_name`).
- Period `Select` from `imports.filter(i => i.bank_account_id === acctId)`; each option labelled `fmtDate(period_start) → fmtDate(period_end)`. When empty show disabled "No imports yet".
- "Upload statement" primary button (jumps to Upload tab).
- "Add manual transaction" outline button (opens same manual dialog as Transactions page — colocated copy of the dialog form).

**Empty state**: when `!acctId`, render a centered `card-glass` "Select an account to begin reconciliation" — no KPIs, no tabs.

**KPI row (5× `BankKpi`)** for selected account/period:
- Statement balance — `statementBalanceFor(acctId)`.
- System balance — `currentBalanceFor(acctId)`.
- Difference — statement − system, tone `success` when `|diff| < 0.01`, else `warn`.
- Reconciled this period — count of period txns whose status ∈ {matched, cleared, approved, posted}.
- Outstanding — total period txns − reconciled count.

**Progress bar**: emerald fill, `reconciled/total * 100`, label "X% reconciled · Y items remaining". Zero when no period.

**Tabs** (5, amber underline style matching existing Bani tab convention already used in this project):
1. **Overview**
2. **Upload**
3. **Review**
4. **Exceptions** — label shows badge count of exceptions
5. **Close period**

**Overview tab**: three summary boxes above two columns — Opening balance (`period.opening_balance`), Total in (sum `money_in`), Total out (sum `money_out`). Two side-by-side columns:
- Left "Reconciled" (emerald header): period txns with status ∈ settled set; each row `border-l-2 border-emerald-500/30 rounded-none`.
- Right "Outstanding" (amber header): all others; each row `border-l-2 border-amber-400 rounded-none`.
- Row content: Date, Description (truncated), Source badge (reused helper from Prompt 2), amount coloured emerald if in / red if out.
- Row click opens `TransactionReviewPanel` (from `bank/recon/`) inside a `<Sheet>`.

**Upload tab**: renders `StatementUploadFlow` with `open={true} onClose={() => {}} onCommitted={reload} accounts={accounts} reload={reload} tenantId={tenantId}`. Below it a table of previous imports for the selected account: Period, File name, Transaction count (count of `transactions.filter(t => t.import_id === i.id)`), Uploaded date, Status badge. Status mapping: `reconciled` → emerald "Closed", `in_progress` → amber "In progress", `pending` → muted "Pending", others → base style.

**Review tab**: renders `FilteredTxnList` scoped to selected account + period date range. Row click → `TransactionReviewPanel` Sheet. Two bulk action buttons above it:
- "Accept all high confidence" (emerald outline) → for each period txn with `match_confidence === 'high'`, `updateTxn(id, { status: 'matched' })`.
- "Flag all low confidence" (amber outline) → for each period txn with `match_confidence === 'low'`, `updateTxn(id, { status: 'needs_review' })`.

**Exceptions tab**: period txns matching any of:
- No `category_account_id` and no `matched_record_id` → "No GL account" → "Assign account" button opens inline GL `Select` (writes via `updateTxn({ category_account_id })`).
- `source === 'system'` (via helper from Prompt 2) and `status` ∉ {matched, cleared} → "Unconfirmed system transaction" → "Match to statement" → opens `TransactionReviewPanel`.
- `match_confidence === 'low'` → "Low confidence" → "Review" → opens `TransactionReviewPanel`.

Table columns: Date, Description, Amount, Issue type, Action. Tab badge = total count. Bottom pinned red notice: "Resolve all exceptions before closing the period."

**Close period tab**: three summary values (Statement balance, System balance, Difference). Three states:
- Exceptions > 0: red card "Cannot close — X exceptions remain. Go to Exceptions tab to resolve them." + "Go to exceptions" button (switches tab).
- Exceptions 0 & |diff| ≥ 0.01: amber card "HK$ X difference remains. You may close with a noted difference or continue investigating." + buttons "Close with noted difference" (amber outline) and "Go to exceptions".
- Exceptions 0 & |diff| < 0.01: emerald card "All transactions reconciled. Ready to close." + primary "Close and lock period".

**Close action**: insert into `bank_reconciliation_periods` `{ bank_account_id, period_start, period_end, statement_balance: statementBalanceFor(acctId), ledger_balance: currentBalanceFor(acctId), difference, status: 'closed', locked_by: (await supabase.auth.getUser()).data.user?.id, locked_at: new Date().toISOString(), tenant_id: tenantId }`. Then bulk update all period txns whose current status ∈ {matched, approved, posted} to `status: 'cleared'`. Call `reload()`. Toast "Period closed and locked." via sonner. Switch to Overview tab.

Do not post journal entries. That stays in the Finance module.

### 4. Design conventions
- All cards `card-glass`.
- Loading state → four skeleton rows (reuse `Skeleton` from `@/components/ui/skeleton`).
- Empty states → one-line message + CTA button (never bare spinner).
- `tenantId` always from `useBankModule`. No `useActiveTenant` call in the page.
- Toasts via `sonner`.

### Files touched
- `src/components/bank/recon/StatementUploadFlow.tsx` — new (copy + import swap + tenant_id on imports, transactions, and accounts inserts).
- `src/components/bank/recon/TransactionReviewPanel.tsx` — new (copy + import swap).
- `src/components/bank/recon/MappingRulesTab.tsx` — new (copy + import swap).
- `src/components/bank/recon/RulesTab.tsx` — new (copy + import swap).
- `src/components/bank/recon/AuditTab.tsx` — new (copy + import swap).
- `src/components/bank/recon/FilteredTxnList.tsx` — new (copy + import swap).
- `src/pages/bank/BankReconciliationPage.tsx` — full rewrite.

### Untouched (per prompt)
`useBankReconciliation.ts`, all `src/components/finance/bank-recon/*` originals, `BankAccountsPage`, `PaymentMatchingPage`, `TransfersPage`, `FxMultiCurrencyPage`, `BankRulesPage`, `BankFeesPage`, Finance pages. No DB migrations. No route changes.
