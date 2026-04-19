
## Add Revenue + Cost-of-Revenue % to Monthly Spend Trend

### Goal
On the Procurement Dashboard's Monthly Spend Trend chart, overlay monthly revenue and a cost-of-revenue ratio (Procurement Spend ÷ Revenue %) so the user can see procurement cost in context.

### Data
- Already loaded: `invoices` (has `invoice_date`, `total_amount`) → monthly spend
- New fetch: `sales_records` (`date`, `total_sales`) → aggregate to monthly revenue
- Compute per month:
  - `spend` = sum of invoice totals
  - `revenue` = sum of `total_sales`
  - `costPct` = `spend / revenue * 100` (null/hidden if revenue = 0)

### UI changes (only `ProcurementDashboardTab.tsx`)
1. Fetch `sales_records` alongside the existing parallel queries.
2. Build `monthlyTrend` items as `{ month, spend, revenue, costPct }` (rename `value` → `spend`).
3. Convert the all-time chart from `BarChart` to `ComposedChart` with **dual Y-axes**:
   - Left axis ($): grouped Bars — Spend (terracotta) + Revenue (teal `hsl(175,55%,42%)`)
   - Right axis (%): Line for Cost % (accent `hsl(14,70%,52%)`) with dots
   - Tooltip shows all three: Spend, Revenue, Cost of Revenue %
   - Legend at top
4. Apply the same enhancement to the Daily view (single month / custom range): add daily revenue bar + daily cost % line on the existing ComposedChart.
5. Update card title to **"Monthly Spend vs Revenue"** (and **"Daily Spend vs Revenue"** for daily view).

### Notes
- If a month has no sales records, the revenue bar is 0 and the cost % line skips that point (set to `null`).
- No schema changes. No other charts/KPIs touched.

### Verification
- All Time view shows 3 series (Spend bars, Revenue bars, Cost % line) with two Y-axes.
- Tooltip shows `$Spend`, `$Revenue`, `XX.X% Cost of Revenue`.
- Single-month view shows daily spend, daily revenue, and daily cost %.
- Months without sales display revenue=0 and no Cost % point.
