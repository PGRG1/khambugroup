

## Plan: Add Three Scatterplot Charts with Statistical Reference Lines

### Overview
Add three new scatterplot charts to the Revenue Overview dashboard: **Daily Revenue**, **No. of Guests**, and **Spend per Guest**. Each chart shows individual data points (one per trading day) color-coded by month, with statistical reference lines and interactive filters for day-of-week and month selection.

### New Component: `src/components/dashboard/ScatterAnalysisCharts.tsx`

A single component rendering three scatter charts in a 2-column grid (third chart on its own row or filling the grid). Each chart includes:

**Filters (shared across all three charts):**
- **Day-of-week pills** (Mon–Sun) — toggle which weekdays to include. All selected by default. Click to toggle on/off.
- **Month legend** — clickable month chips (same pattern as CumulativeSalesChart). All shown by default; click to toggle visibility.

**Chart content (Recharts `ScatterChart`):**
- X-axis: day of month (1–31)
- Y-axis: the metric value
- Each dot = one trading day, colored by its month
- Tooltip shows: date, day, month, and value

**Statistical reference lines (`ReferenceLine`):**
- **Avg** — dashed line, labeled "Avg"
- **Med** — solid line, labeled "Med" (median)
- **P75** — dotted line, labeled "P75" (75th percentile)
- **P25** — dotted line, labeled "P25" (25th percentile)
- Calculated from visible (filtered) data points only
- Subtle colors, small labels on the right Y-axis area

**Data preparation:**
- Aggregate sales records by date (same logic as existing `dailySales`)
- Each point: `{ date, day, dayOfMonth, month, totalSales, guests, spendPerGuest }`
- Filter by selected days and months before rendering
- Recalculate stats on filtered subset

### Integration into `DashboardCharts.tsx`

- Import and render `ScatterAnalysisCharts` inside the `view === "daily"` block
- Place it after the Cumulative Sales chart and before the existing Daily Sales line chart
- Pass the raw `data: SalesRecord[]` prop
- Add a section header: "Daily Distribution Analysis"

### Technical Details

- Uses Recharts `ScatterChart`, `Scatter`, `ZAxis`, `ReferenceLine`, `Cell`
- Percentile calculation: sort values, interpolate at 25% and 75% positions
- Reuses existing `MONTH_COLORS`, `tooltipStyle`, `axisStyle`, `gridColor` constants
- Reuses `ChartCard` wrapper, `getMonthKey`, `getMonthLabel`, `formatCurrency` utilities
- Day filter and month filter state managed locally within the component via `useState`

### Chart Specifications

| Chart | Y-axis format | Tooltip format |
|-------|--------------|----------------|
| Daily Revenue | `$12k` | `$12,345` |
| No. of Guests | plain number | `89` |
| Spend / Guest | `$123` | `$123` |

