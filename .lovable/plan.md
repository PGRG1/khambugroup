
# Bani Home — Business Command Centre

A new top-level page that sits above all modules and answers: *"What's happening in my business today?"* It surfaces priorities, financial signals, and quick links — not a static dashboard.

## Route & navigation

- Route: `/` (Home button in sidebar). Replace the current landing component with the new `Home` page.
- Keep `src/pages/Index.tsx` available but route `/` to the new `src/pages/Home.tsx`.
- Sidebar Home entry stays as is (no changes needed beyond label confirmation).

## Page shell

- `PageHeader` with title **Bani Home** and subtitle *"This is what's happening in your business today."*
- Top filter bar (sticky on desktop):
  - Venue / outlet multi-select (reuses `useVenues`)
  - Date range selector (defaults to MTD, presets: Today / WTD / MTD / QTD / YTD / Custom)
  - Primary button: **New Report** (opens existing report generator route)
  - Quick actions dropdown: Upload Bill, Upload Statement, New Expense, Upload Invoice, Record Payment

## Layout (responsive)

```text
┌──────────────────────────── Filters ────────────────────────────┐
├─ KPI row (6 cards, 3-col on tablet, 1-col on mobile) ───────────┤
├─ Today's Priorities (full width, scrollable list, max 8) ───────┤
├─ Revenue Trend MTD (2/3) │ Profit & Margin Snapshot (1/3) ──────┤
├─ Cash Position (1/3) │ Expense Overview (1/3) │ Procurement (1/3)┤
├─ AI Insights (1/2) │ Recent Activity (1/2) ──────────────────────┤
└─────────────────────────────────────────────────────────────────┘
```

All cards use existing `card-glass`, rounded, minimal — no decorative icons, accent colours only for status dots, deltas, and the primary button.

## KPI cards (top row)

Each uses `KpiCard` extended with an inline sparkline (recharts `<Line>` no axes). Click → deep link.

1. **Revenue MTD** — current, % vs last month, target, sparkline. → `/revenue`
2. **Gross Profit** — amount, GM%, Δ vs last month, sparkline. → `/finance/ledger-pl`
3. **Labour Cost %** — current %, target %, variance, sparkline. → `/hr/payroll`
4. **Food Cost %** — current %, target %, variance, sparkline. → `/procurement` (inventory tab)
5. **Cash in Bank** — total, last updated timestamp, sparkline. → `/finance/cashflow`
6. **Bills Due** — total due, # overdue, next payable amount. → `/expenses` + `/finance/payables`

## Today's Priorities

Unified action list aggregated from existing hooks. Each row: title, short context, amount/metric, `StatusBadge`, chevron → module.

Sources:
- `useInvoiceData` — invoices in `pending_review`
- `useExpenseBills` + `usePayables` — overdue bills
- `useHRData` payroll vs revenue → labour cost variance flag
- `useBankReconciliation` → bank charges detected, unmatched txns
- `useProductMaster` / inventory — variances, low stock
- Supplier price increase signal (from `invoice_line_items` last-30d delta)
- `useVendorStatements` — statements awaiting review
- Missing invoice upload — bills with no attachment

Ranking: severity (overdue > variance > review) then amount desc, capped at 8 with "View all" footer.

## Section cards

- **Revenue Trend MTD** — line chart: actual vs target, MTD total, % vs target. Data via `useSalesData` + `useRevenueTargets`.
- **Profit & Margin Snapshot MTD** — horizontal waterfall (Revenue → COGS → GP → Opex → OP) with GM% and OM% chips. Data via `useLedgerPL` (current period).
- **Cash Position** — total cash, operating cash MTD, net cash flow MTD, bank account count. Data via `useCashflowData` / `bank_accounts`. Link → `/finance/cashflow`.
- **Expense Overview MTD** — total expenses, bank-detected count + sum, avoidable costs (late fees + penalties + bank charges from `expense_categories` tagged set). Link → `/expenses`.
- **Procurement & Inventory Health** — low stock count, supplier price increase count, invoice upload delay count, wastage signals, inventory variances. Link → `/procurement`.
- **AI Insights** — 3–5 plain-English bullets generated client-side from the same numbers (no new edge function). Template-driven: revenue vs target, labour vs target, GM delta vs last month, avoidable cost detection, supplier price increases.
- **Recent Activity** — last 10 entries from `audit_log` + `expense_bill_audit` + `ledger_audit_log`, normalized to {actor, action, target, time, link}.

## Data layer

New aggregator hook `src/hooks/useHomeData.ts` that:
- Accepts `{ venueIds, dateRange }`
- Calls existing hooks in parallel and returns a single `HomeSnapshot` object
- Memoizes sparkline series (last 30 days) per KPI

No new tables, no new edge functions, no schema changes. All values come from existing hooks/views.

## Files to create

- `src/pages/Home.tsx`
- `src/components/home/HomeFilters.tsx`
- `src/components/home/HomeKpiRow.tsx` (uses existing `KpiCard` + new tiny `Sparkline.tsx`)
- `src/components/home/Sparkline.tsx`
- `src/components/home/TodaysPriorities.tsx`
- `src/components/home/RevenueTrendCard.tsx`
- `src/components/home/ProfitSnapshotCard.tsx`
- `src/components/home/CashPositionCard.tsx`
- `src/components/home/ExpenseOverviewCard.tsx`
- `src/components/home/ProcurementHealthCard.tsx`
- `src/components/home/AiInsightsCard.tsx`
- `src/components/home/RecentActivityCard.tsx`
- `src/hooks/useHomeData.ts`
- `src/lib/homeInsights.ts` (insight template generator)

## Files to edit

- `src/App.tsx` — point `/` to new `Home` page (keep `Index` reachable at `/legacy` if useful, otherwise drop).
- `src/components/AppSidebar.tsx` — confirm Home item label/icon; no structural change.

## Out of scope

- No new DB tables, RLS, or edge functions.
- No changes to Revenue, Expenses, Procurement, Finance, Accounting, or Reports modules.
- No AI/LLM call — insights are deterministic templates over existing numbers.
