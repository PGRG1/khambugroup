

Great idea. For months where data stops mid-month (like Mar 2026 in your screenshot which only has data up to day 3), we can extend the line to the end of the month as a **dotted/dashed line** carrying forward the last known cumulative value. This makes it visually clear where actual data ends and where the projection/flat-line begins.

## How it works

1. **Detect last actual data day per month** — for each month, find the maximum day that has real sales data.

2. **Split data into two series per month** — instead of one `<Line>` per month, render two:
   - **Solid line** (`mk`) — contains cumulative values only up to and including the last data day. Values after that day are `undefined` so the line stops.
   - **Dashed line** (`mk_projected`) — starts from the last data day (overlapping by one point for continuity) and carries the final cumulative value flat through day 31. Uses `strokeDasharray="5 3"` for the dotted appearance.

3. **Data transformation** — in the `cumulativeData` memo, for each month:
   - Find `lastDay` = max day with actual data
   - For days `<= lastDay`: set `row[mk]` = cumSum, leave `row[mk_projected]` = undefined (except on `lastDay` itself, set both for seamless join)
   - For days `> lastDay`: set `row[mk_projected]` = final cumSum, leave `row[mk]` = undefined

4. **Chart rendering** — for each month, render two `<Line>` components:
   - Solid line for actual data
   - Dashed line (same color, `strokeDasharray="5 3"`, slightly thinner) for the projected/no-data portion
   - Both share the same `hide` logic from `isMonthHidden`
   - Dashed line excluded from tooltip (or shown with a "projected" label)

5. **Legend stays unchanged** — one entry per month, controls both solid and dashed lines together.

