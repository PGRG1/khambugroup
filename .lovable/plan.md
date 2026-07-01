## Plan — Prompt 2: Promote Payments to top-level sidebar section

### 1. Sidebar — `src/components/AppSidebar.tsx`
- Add new arrays:
  - `paymentsOverview = { title: "Dashboard", url: "/payments", icon: LayoutDashboard, end: true }`
  - `paymentsMasterData` — Processors (`?tab=processors`, Building2), Merchants (`?tab=merchants`, Store), Fee Rates (`?tab=fee-rates`, Percent)
  - `paymentsOperations` — Imports (`?tab=imports`, Upload), Settlement Batches (`?tab=batches`, Layers), Fee Audit (`?tab=details-audit`, ShieldCheck)
  - `paymentsReconciliation` — Monthly Check (`?tab=monthly-recon`, CheckSquare)
- Extend `GroupKey` union + `loadGroupState` defaults with `payments: true`.
- Insert `CollapsibleNavGroup groupKey="payments" label="Payments"` **between the Bank block (ends at line 512) and the People block (starts at line 515)**. Gate visibility with `showFinance` (admin, non-preview) — same rule the current Payments link uses.
- Structure mirrors Bank: `renderLink(paymentsOverview)` on top, then three `{ label, items }` sub-collapsibles ("Master Data", "Operations", "Reconciliation").
- Remove `{ title: "Payments & Settlements", url: "/finance/payments-settlements", icon: TrendingUp }` from `financeItems` (line 42).
- Add new lucide icon imports: `Store`, `Percent`, `Upload`, `Layers`, `ShieldCheck`, `CheckSquare` (LayoutDashboard/Building2 already imported).

### 2. Routes — `src/App.tsx`
- Remove `import PaymentsSettlements from "./pages/finance/PaymentsSettlements"` and its `/finance/payments-settlements` route.
- Add `import PaymentsPage from "./pages/payments/PaymentsPage"` and admin-protected route `/payments` → `<PaymentsPage />` (match existing admin-gated route pattern used for `/finance/*`).

### 3. Fix imports in existing tab components (logic unchanged)
- `src/components/finance/payments/MerchantsTab.tsx`:
  - `import { toast } from "@/hooks/use-toast"` → `import { toast } from "sonner"`
  - Rewrite every `toast({ title, variant: "destructive" })` → `toast.error(title)`; success calls → `toast.success(title)` (keep the message string; drop `description` or merge into single message).
  - `import type { BankAccount } from "@/hooks/useBankReconciliation"` → `from "@/hooks/useBankModule"`.
- `src/components/finance/payments/AiMatchModal.tsx`:
  - Same sonner toast conversion.
  - `import type { BankTxn, BankAccount } from "@/hooks/useBankReconciliation"` → `from "@/hooks/useBankModule"`.
- `src/components/finance/payments/ParseSettlementModal.tsx`:
  - Sonner toast conversion.
  - Extend props with `tenantId: string | null`.
  - On every insert into `payment_settlement_batches`, `payment_settlement_lines`, `payment_settlement_transactions`, add `tenant_id: tenantId` to the payload (guard: if `!tenantId`, `toast.error` and abort).

### 4. New page — `src/pages/payments/PaymentsPage.tsx`
Full rewrite of the current PaymentsSettlements page with the new UX. Structure:

- Hooks:
  - `const { tenantId, loading, processors, merchants, imports, batches, lines, transactions, feeRates, reload } = usePaymentSettlements()`
  - `const { accounts: bankAccounts, transactions: bankTxns } = useBankModule()`
  - `const [params, setParams] = useSearchParams()`; `const tab = params.get("tab") || "overview"`; `const setTab = (t: string) => setParams(t === "overview" ? {} : { tab: t })`.
  - Processor selector: local state seeded to KPay-if-present else `"__all__"` (existing default logic reused).
- Header row 1: title / subtitle left; processor `Select` right (all processors with `· N rules` suffix + "All processors" option).
- Header row 2 — workflow stepper: compute `activeStep` from data:
  - No imports → 1; imports but no batches → 2; batches with `audit_status !== 'ok'` → 3; batches with `status === 'unmatched'` → 4; else all matched → 5 (all emerald).
  - Render 4 `rounded-full px-3 py-1 text-[11px]` pills separated by `→`, coloured muted / amber (active) / emerald (done).
- 4 KPI cards (`card-glass`, `text-[10px] uppercase tracking-wider text-muted-foreground` label + `text-xl font-semibold td-num` value, no icons): Gross transactions, Total fees, Net settled, Unmatched batches (amber-400 if >0 else emerald-400). Reuse existing totals math.
- Custom tab bar (`border-b border-border flex items-center`) — no `Tabs/TabsList` primitive. Each button: `px-4 py-2 text-sm border-b-2 border-transparent text-muted-foreground hover:text-foreground`; active: `border-amber-400 text-amber-400 font-medium`. Order: Overview · Batches · Fee Audit · Monthly Check · `<div class="w-px h-4 bg-border mx-2 self-center" />` · Processors · Merchants · Fee Rates · Imports. Clicking calls `setTab`.
- Tab bodies (all wrapped in `card-glass` where noted):
  - **Overview**: 2-col grid.
    - Left "Processors" card: one row per processor with left border emerald (all matched) or amber (any unmatched), name, sky "type" badge, merchant + fee-rule counts, last import date, amber unmatched-count badge. Click sets `processorId` + `setTab("batches")`. Empty CTA when none.
    - Right "Recent batches" card: last 8 batches (all processors) sorted by settlement_date desc; columns Date, Merchant, Net, Status badge (matched emerald / unmatched amber / parsed sky / pending muted). Row click → `setTab("batches")`. "View all →" header link.
    - Delete the old how-to card entirely.
  - **Processors** (new CRUD): table columns Name · Type · Merchants · Fee rules · Active · Actions. Active badge toggles `is_active` via `supabase.from("payment_processors").update({ is_active: !p.is_active }).eq("id", p.id)` then `reload()`. "Add processor" button opens a shadcn `Dialog` with Name (required), Type Select (card/mobile_payment/cash/other), Notes textarea, Active switch. Save inserts with `tenant_id: tenantId`. Edit reuses same dialog pre-filled. Delete: `DeleteConfirmDialog`; block when `merchants.filter(m => m.processor_id === p.id).length > 0` with `toast.error("This processor has N merchants. Remove them first.")`.
  - **Batches** → `<SettlementBatchesTab processor merchants={procMerchants} batches={procBatches} lines={procLines} transactions={procTxns} bankTxns bankAccounts onReload={reload} />`
  - **Fee Audit** (`details-audit`) → `<SettlementDetailsAuditTab processor merchants={procMerchants} batches={procBatches} transactions={procTxns} />`
  - **Monthly Check** (`monthly-recon`) → `<MonthlyReconciliationTab processor merchants={procMerchants} batches={procBatches} lines={procLines} />`
  - **Merchants** → `<MerchantsTab processor merchants={merchants} bankAccounts={bankAccounts} onChanged={reload} />`
  - **Imports** → `<ImportsTab processor imports={imports} merchants={merchants} tenantId={tenantId} onChanged={reload} />`
    - **Intentional deviation, required for RLS**: ImportsTab receives one additional prop `tenantId: string | null` beyond its current interface. Forward it directly to ParseSettlementModal. No other logic in ImportsTab changes. Without this, new imports won't have `tenant_id` on the inserted batches, lines, and transactions, breaking the RLS from Prompt 1.
  - **Fee Rates** → `<FeeRatesTab processor merchants={procMerchants} allProcessors={processors} allMerchants={merchants} allFeeRates={feeRates} onReload={reload} />`

### 5. Delete
- `src/pages/finance/PaymentsSettlements.tsx`.

### 6. Design conventions
- `card-glass` for all cards. Table headers `text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40`. Even rows `bg-muted/30`. Numeric cells `text-right tabular-nums font-mono`. Toasts via `sonner`. Empty states = one line + CTA.

### Files touched
- `src/components/AppSidebar.tsx` (edit)
- `src/App.tsx` (edit)
- `src/components/finance/payments/MerchantsTab.tsx` (import + toast fix)
- `src/components/finance/payments/AiMatchModal.tsx` (import + toast fix)
- `src/components/finance/payments/ParseSettlementModal.tsx` (toast + tenant_id on inserts)
- `src/components/finance/payments/ImportsTab.tsx` (thread `tenantId` prop to ParseSettlementModal — see deviation note above)
- `src/pages/payments/PaymentsPage.tsx` (new)
- `src/pages/finance/PaymentsSettlements.tsx` (delete)

### Unchanged
`SettlementBatchesTab`, `SettlementDetailsAuditTab`, `MonthlyReconciliationTab`, `FeeRatesTab`, `usePaymentSettlements` (already tenant-scoped in Prompt 1). No DB migrations.
