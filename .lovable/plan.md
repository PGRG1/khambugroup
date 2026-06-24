# Procurement Finance Page

A new read-only page giving procurement staff a complete financial view of supplier activity: spend, payables, and credits — all in one place. No changes to existing Finance pages.

---

## 1. Sidebar (`src/components/AppSidebar.tsx`)

- Import `ReceiptText` from `lucide-react`.
- Add `procurementFinance` array after `procurementAnalysis`:
  ```ts
  const procurementFinance = [
    { title: "Spend Summary", url: "/procurement/finance", icon: ReceiptText },
  ];
  ```
- Append `{ label: "Finance", items: procurementFinance }` to the procurement sub-group array (line ~345) so it renders below "Analysis" using the existing collapsible/styling pattern — no new markup needed.

## 2. Route (`src/App.tsx`)

- Import `ProcurementFinance` and add `<Route path="/procurement/finance" element={<ProcurementFinance />} />` alongside the other procurement routes.

## 3. New page `src/pages/procurement/ProcurementFinance.tsx`

### Header
- `<PageHeader>` title "Procurement Finance".
- Period selector: month/year with prev/next arrows, default = current month.
- Venue dropdown sourced from distinct `goods_received_notes.venue` (default "All venues").

### Tabs (shadcn `Tabs`)
1. **Spend Summary**
2. **Supplier Payables**
3. **Credits & Deposits**

Active tab styled with amber underline + amber text. Section headers inside tabs use the existing uppercase/tracked muted style.

### Tab 1 — Spend Summary
- **Data**: `grn_items` joined to `goods_received_notes` and `product_master`, scoped by tenant.
  - **PostgREST join hint**: use the explicit FK hint `goods_received_notes!grn_id` (and `product_master!product_master_id`) when selecting nested relations, to avoid the relationship-conflict issue we fixed earlier.
  - Net spend: `status='confirmed'`, `received_date` in period, `creates_stock_movement=true`, `financial_treatment NOT ILIKE 'Asset%'`, venue filter when set.
  - Disputes: same filters but `status='disputed'`.
  - Deductions: `invoice_line_items` with negative `unit_price` and `creates_stock_movement=false` (refunds), plus `credit_notes` with `status IN ('fully_applied','approved')`, both filtered by date in period.
  - Last month: rerun the net-spend query for the previous month.
- **4 KPI cards** (`KpiCard`/`KpiGrid`): Net spend, Refunds & credits (green), Disputes outstanding (amber), vs last month (up red / down green).
- **Spend by category** table grouped by `product_master.level1_category` with This month / Last month / Change columns. Each row has a thin progress bar showing share of total.
- **Deductions** section showing refunds and credit notes applied, followed by "NET SPEND <Month>".
- **Disputes banner** (amber) when value > 0, linking to `/procurement/invoices?status=disputed`.

### Tab 2 — Supplier Payables
- Reuse `usePayables` hook as-is.
- **4 KPI cards**: Total outstanding (amber), Overdue (red), Due this week (sky), Paid this month (green).
- **Aging breakdown**: horizontal bar with 5 buckets (Current / 1-30 / 31-60 / 61-90 / 90+) coloured green / sky / amber / purple / red. Computed from `usePayables` open invoices using `age_days`.
- **Supplier table** from `supplierSummary`: Supplier, Outstanding (amber if > 0), Open invoices, Oldest (red if > 60), Last invoice, Action (Pay → `RecordPaymentDialog`).
- **Footer note** (muted): "Full payment management available in Finance → Accounts Payable →" linking to `/finance/payables`.
- Mount `RecordPaymentDialog` and `PaymentHistoryDialog` from `@/components/finance/payables/*`.

### Tab 3 — Credits & Deposits
**Section A — Credit Notes**
- Fetch with `fetchAllRows('credit_notes', ...)` scoped by tenant.
- **Also fetch `suppliers` via `fetchAllRows`** and build a `supplierMap` (id → name) to resolve `supplier_id` to a display name in the table — `credit_notes` only stores `supplier_id`.
- Summary line: "Available credits: $X   Pending review: N".
- Table: CN #, Supplier (from map), Date, Original, Remaining (amber if > 0), Status badge.

**Section B — Deposit Position** (all-time, not period-filtered)
- Fetch `invoice_line_items` joined to `product_master` (treatment ILIKE `'Asset - Supplier Deposit%'`) and `invoices` (supplier). Reuse the `supplierMap` from Section A for names.
- Group by supplier: `paid` = positive line totals; `returned` = abs of negatives; `net` = paid − returned.
- Summary line + per-supplier table. Net column: amber if > 0, green if 0, red if negative.
- Footer link → `/procurement/deposit-ledger`.

## Styling & utilities
- Dark zinc / `card-glass`, currency via `@/utils/format`, `StatusBadge`, `KpiCard`, `PageHeader`.
- All Supabase reads tenant-scoped via `useActiveTenant` + `fetchAllRows` where pagination matters.

## Out of scope (unchanged)
`src/pages/finance/Payables.tsx`, `usePayables`, `RecordPaymentDialog`, `PaymentHistoryDialog`, `credit_notes` schema, Deposit Ledger page, Credit & Debit Notes page.
