

## Plan: Add Sales Projection to Cumulative Sales Chart

### What it does
For the current month, the cumulative sales line will extend beyond the last actual data point as a **dotted line** showing projected sales through month-end. The projection uses historical medians specific to each day of the week.

### Projection formula
For each future day (e.g., day 15-30 of April):
1. Determine the day of week (Mon, Tue, etc.)
2. From all historical data passed to the chart, compute **median guests** and **median spend per guest** for that specific day of week
3. Projected daily sales = `median_guests × median_spend_per_guest × 1.10` (10% service charge)
4. Add to the running cumulative total

### Visual behavior
- The actual data line remains **solid** (unchanged)
- From the last actual day onward, a **dotted line** extends to the end of the month
- The dotted line starts at the same cumulative value where actuals end, ensuring seamless continuation
- Only applies to the **current month** (the latest month in the dataset where today falls within that month)
- The legend entry for the projected month stays the same color; no separate legend item needed

### Technical approach

**File: `src/components/dashboard/CumulativeSalesChart.tsx`**

1. **Identify current month**: Check if the latest month key matches the current calendar month. If so, mark it as the month needing projection.

2. **Compute day-of-week medians**: Using all historical data, group daily totals (guests, spend per guest) by day of week. Calculate the median for each.

3. **Generate projected days**: For days after the last actual day through the end of the month, look up the day of week, get median guests and median spend per guest, compute projected sales with the 10% service charge formula.

4. **Split the current month into two data series**:
   - `{monthKey}` — actual cumulative values (solid line, unchanged)
   - `{monthKey}_proj` — starts at the last actual cumulative value and continues with projections (dotted line, `strokeDasharray="6 4"`)

5. **Tooltip handling**: The projected line tooltip will indicate "Projected" and show the formula-derived value.

6. **Legend**: No change needed — the projected portion uses the same color with a dashed style, which is self-explanatory.

### No database or backend changes required
All calculations are done client-side from the existing sales data already passed to the component.

