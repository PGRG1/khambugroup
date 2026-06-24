
# Purchase Analysis — Spend Trend Chart + Cost % Strip

Single-file change to `src/pages/procurement/PurchaseAnalysis.tsx`. No new files, no schema changes, no other sections touched.

## 1. Additional data fetch

Inside the existing `useEffect` that loads tenant data, alongside the GRN fetch, also load sales:

```
salesRaw = fetchAllRows("sales_records", "date, total_sales, venue", undefined, tenantId)
```

Store it in component state (`salesRows`). Venue filter for sales is intentionally NOT applied (sales venue strings may not align with GRN venue strings) — sales are only filtered by date. This matches the user's choice from clarifying questions.

Derive:
- `salesInPeriod` — sales rows whose `date` falls inside current period range.
- `salesPrior` — sales rows for the prior period range (used only for monthly buckets crossing into prior).
- `hasSalesData = salesInPeriod.length > 0`.
- `totalRevenue = sum(total_sales) of salesInPeriod`.

## 2. Cost group definitions

Module-level `COST_GROUPS` array with three entries (food, beverage, tobacco), each with `key`, `label`, `color`, and case-insensitive `match(level1_category)` function (beverage matches bev/drink/liquor/beer/wine; tobacco matches tobacco/smok/cigar).

Compute `groupSpend[key]` from the existing in-scope GRN items (`scoped` — already filtered for confirmed status, stock-moving, non-asset, venue, etc.) using `accepted_qty * unit_cost` (the existing `lineValue` helper).

`activeGroups = COST_GROUPS.filter(g => groupSpend[g.key] > 0)` — only groups with spend render as chips.

`totalCostPct = totalRevenue > 0 ? (totalSpend / totalRevenue) * 100 : null`.

## 3. Replace the Section 2 right-panel chart

Keep Section 2 grid (`1.1fr 0.9fr`) and the left-side "Spend by category" card untouched. Replace the contents of the right-side "Spend trend" card.

### 1M mode — daily cumulative ComposedChart

Build `chartData` for days 1..maxDay (where maxDay = today's day-of-month if viewing the current month, otherwise the full month length):

For each day, accumulate:
- `cumSpend` from `scoped` GRN items where `received_date === YYYY-MM-DD`.
- `cumRevenue` from `salesInPeriod` where `date === YYYY-MM-DD` (only emitted when `hasSalesData`).
- `cumSpendPrior` from `scopedPrior` GRN items on the same day of the prior month.

Render `ComposedChart` height 200px, left Y axis only, `fmtShort` tick formatter, with three series in this order:
1. `Area cumRevenue` — teal `hsl(175 55% 42%)`, fillOpacity 0.08, only when `hasSalesData`.
2. `Line cumSpendPrior` — amber `#E8820C`, dashed `5 4`, opacity 0.35, no dots.
3. `Area cumSpend` — solid amber `#E8820C`, fillOpacity 0.07, activeDot r4.

Tooltip uses the existing `tooltipStyle/tooltipItemStyle/tooltipLabelStyle` constants. Currency formatter via existing `fmtMoney`.

### 3M / 6M / 12M mode — monthly bars ComposedChart

Build `monthlyData` from the existing `range.months` array. For each `{y, m}`:
- `spend` = sum of `lineValue` over scoped+scopedPrior items whose `received_date` is in that month (the existing `scoped` covers current-period months; `scopedPrior` covers prior-period months — we use whichever bucket the month belongs to so the chart spans the full window cleanly).
- `revenue` = sum of `total_sales` over `salesRaw` (sales rows, no venue filter) whose `date` is in that month, only when `hasSalesData`.
- `label` = `MMM YY`.

Render `ComposedChart` height 200px, left Y axis only, with two bars: Revenue (teal, fillOpacity 0.5) and Net spend (amber). Spend bar always rendered; revenue bar only when `hasSalesData`. Rounded top corners `[3,3,0,0]`.

Mode switch is driven by the existing `period` state (`1M` vs everything else).

## 4. Cost % metric strip (new block below Section 2)

Rendered as a new block between Section 2 and Section 3 (Top items). One row of equal-width chips using `grid gap-px bg-border rounded-xl overflow-hidden` so the border colour shows through as 1px dividers. Column count = `activeGroups.length + 1`.

Chip order: Total cost % (always first, amber), then one chip per active group (Food green, Beverage sky, Tobacco purple).

`CostChip` is defined inline in the file with this shape:
- Label (11px muted)
- Value (`{value.toFixed(1)}%` or `—`) in the group colour, large tabular-nums
- Sub-label (10.5px muted): `{fmtShort(spend)} spend · {fmtShort(revenue)} revenue` or `... · no revenue data`

Below the strip, a centred footnote: when `hasSalesData`, "Cost % = category spend ÷ total revenue (...) · Sourced from confirmed GRNs"; otherwise "Add revenue data in Sales Records to see cost % figures".

## 5. Helpers / constants

- Reuse existing `fmtMoney`, `fmtShort`, `tooltipStyle`, `tooltipItemStyle`, `tooltipLabelStyle`, `AMBER`, `lineValue` already defined at the top of the file.
- Add new recharts imports: `ComposedChart`, `Area`, `Bar`. `LineChart` import becomes unused and gets removed.

## Out of scope

- KPI cards (Section 1) unchanged.
- Spend-by-category panel (left of Section 2) unchanged.
- Top items table (Section 3), supplier concentration (Section 4) unchanged.
- Period buttons, venue and category filters unchanged.
- Drill-down Sheet and Dialog added earlier remain unchanged.
- Data source remains GRN-only for spend; sales come from `sales_records` only.
- No DB migration, no edits to any other file.
