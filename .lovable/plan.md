# Purchase Analysis Page

A new standalone procurement page giving spend analysis sourced from GRN data (not invoices). Surfaces KPIs, category breakdown + trend, top items, and supplier concentration.

---

## 1. Sidebar (`src/components/AppSidebar.tsx`)

In the `procurementAnalysis` array, remove `disabled: true` from the Purchase Analysis entry so it becomes an active link to `/procurement/purchase-analysis`.

## 2. Route (`src/App.tsx`)

Import `PurchaseAnalysis` and register:
```tsx
<Route path="/procurement/purchase-analysis" element={<AdminRoute><PurchaseAnalysis /></AdminRoute>} />
```

## 3. New page `src/pages/procurement/PurchaseAnalysis.tsx`

### Header
- `<PageHeader>` title "Purchase Analysis".
- Period buttons (1M / 3M / 6M / 12M). 6M default. Active = amber `#E8820C` fill, white text. Inactive = `bg-secondary text-muted-foreground`.
- Right-aligned filters: Venue (distinct `goods_received_notes.venue`) and Category (distinct `product_master.level1_category`), both with "All …" default.

### Data layer
- Use `useActiveTenant` for tenantId; fetch `suppliers` via `fetchAllRows` for id→name map.
- Fetch `grn_items` with explicit FK hints `goods_received_notes!grn_id` and `product_master!product_master_id`, filtered by `tenant_id`. Refetch when period or venue changes.
- Client-side `inScope` filter: `status='confirmed'`, `creates_stock_movement !== false`, `financial_treatment` not starting with `asset`, received_date in period, venue match, category match.
- `lineValue = accepted_qty * unit_cost` per item.
- Compute prior-period dataset with the same duration immediately before the selected window for comparisons.

### Section 1 — KPI cards (4)
`KpiGrid` of: Net spend, vs prior period (red ↑ / green ↓), Top category (`$X · Y% of total`), Items purchased (`across N suppliers`).

### Section 2 — `grid-cols-[1.1fr_0.9fr] gap-3`
**Left — Category breakdown**: per `level1_category`, two stacked horizontal bars (current full opacity, prior 40%) using palette `["#0ea5e9","#22c55e","#a855f7","#f59e0b","#ef4444","#06b6d4","#84cc16"]` cycled. Width proportional to max current spend. Sub-label: `■ This period: $X · ■ Last period: $X`. Sorted desc.

**Right — Spend trend** (recharts `LineChart`, 180px, `ResponsiveContainer`): monthly buckets across selected period. Lines = Total (amber #E8820C, strokeWidth 2, dots) + top 2 categories (assigned colour, strokeWidth 1.5, `strokeDasharray="4 2"`, no dots). Y axis uses `fmtShort`. Reuse `tooltipStyle/tooltipItemStyle/tooltipLabelStyle` from `ProcurementDashboardTab.tsx`. Legend above chart.

### Section 3 — Top items table (full width)
- Header: "Top items by spend" + search input + "Showing top N of total".
- Top 20 by `lineValue` desc (after category filter if active).
- Columns (widths as specified): # / SKU / Item / Category badge / Qty / Net spend / % of total / vs prior (red ↑ / green ↓) / Avg cost.
- Row hover: `bg-primary/5` + 3px amber left border.
- Inline search filters by item name or SKU.
- Virtualized via `useVirtualizer` (same pattern as `ProcurementLineItemsTab.tsx`).
- Wrapper: `card-glass rounded-xl overflow-hidden`, header row `bg-primary text-primary-foreground`.

### Section 4 — Supplier concentration (full width)
Header + right-side insight `Top 3 suppliers = X% of spend`. Horizontal list (not table), one row per supplier sorted desc, max 10:
```
[name 120px] [progress flex-1] [spend 55px] [% 42px] [change 38px] [invoice count 30px]
```
Progress bar `h-2 rounded-full`. Fill amber for top 3, `bg-border` otherwise; width proportional to top supplier spend. Top 3 rows tinted `bg-amber-500/5`. Invoice count = distinct `grn_id` count for that supplier.

### Shared patterns
- `useActiveTenant`, `fetchAllRows`, formatters from `@/utils/format`.
- Recharts constants and `fmtShort` mirrored from `ProcurementDashboardTab.tsx`.
- CSV export button via `downloadCSV` on the Top items table.

## Out of scope
- No DB migration.
- `ProcurementDashboardTab.tsx`, `ProcurementLineItemsTab.tsx`, and all other pages untouched.
- Spend calculations never read `invoices` or `invoice_line_items`.
