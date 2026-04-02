

## Refine Procurement Dashboard — Consistent Styling, Custom Period, Cumulative View, L1 Only, Supplier Labels

### Changes

**File: `src/components/procurement/ProcurementDashboardTab.tsx`**

#### 1. Consistent color palette (no rainbow)
Replace the 12-color `COLORS` array with a muted warm palette derived from the platform's CSS variables (`--primary`, `--accent`, `--chart-1` through `--chart-5`). All charts will use these 5-6 tones with opacity variations instead of saturated rainbow colors.

#### 2. Period filter: add Custom date range
- Add `customFrom` / `customTo` state + calendar popovers (same pattern as `DateFilter.tsx`)
- Add a "Custom" option in the period `<Select>`
- When "Custom" is selected, show two date pickers inline
- Filter invoices by custom date range when active

#### 3. Monthly Spend → Daily + Cumulative when a single month is selected
- When `selectedMonth !== "all"` (a specific month or custom range):
  - Show a **daily spend bar chart** (one bar per day)
  - Add an overlaid **cumulative line chart** (running total as a line on a secondary Y-axis)
- When "All Time" is selected, keep the existing monthly bar chart
- Use `ComposedChart` from recharts with `Bar` + `Line` + dual Y-axes

#### 4. Remove L2 and L3 charts
- Delete the L2 horizontal bar card (lines 447-473)
- Delete the L3 card (lines 477-497)
- Keep only L1 donut chart, make it full width
- Improve L1 donut: add a legend below with $ amounts and % labels, use the warm palette

#### 5. Supplier chart: show both % and $ on bars
- Add a custom bar label renderer that shows `$XXk (XX.X%)` on each bar
- Include percentage calculation based on `grandTotal`
- Use the warm palette instead of rainbow colors

#### 6. Professional polish across all charts
- Increase chart margins to prevent label cropping (left margin for Y-axis labels, right margin for bar labels)
- Use `textAnchor` and padding on YAxis to prevent text truncation
- Set minimum heights properly
- Consistent tooltip styling with `contentStyle` matching `card-glass`
- Consistent font sizes: axis labels 11px, bar labels 10px
- All gradients use the warm primary/accent tones

### Layout (updated)
```text
┌─────────────────────────────────────────────┐
│  Header + Period Filter (+ Custom dates)    │
├──────────┬──────────┬──────────┬────────────┤
│ Total    │ Invoice  │ Avg      │ Unique     │
│ Spend    │ Count    │ Invoice  │ Suppliers  │
├─────────────────────────────────────────────┤
│ Monthly Spend (all) OR Daily+Cumulative     │
├─────────────────────┬───────────────────────┤
│  Spend by Supplier  │  Supplier Concentr.   │
│  ($ + % labels)     │                       │
├─────────────────────┴───────────────────────┤
│  Spend by Category L1 (full width donut)    │
├─────────────────────────────────────────────┤
│  Expenses by Product (top 20 + show all)    │
├─────────────────────────────────────────────┤
│  Price Variance                             │
├─────────────────────────────────────────────┤
│  Supplier Tree View                         │
└─────────────────────────────────────────────┘
```

### Technical details
- Add `ComposedChart, Line` imports from recharts
- Add `Calendar`, `Popover` imports for custom date picker
- Single file change: `ProcurementDashboardTab.tsx`
- No database changes

