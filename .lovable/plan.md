
User wants the table figures to mirror the modal in image-165 (Daily Distribution) which uses per-DOW median guests × per-DOW median avg spend. But they want one tweak:

- **Guests per day** = per-DOW median (as in modal) — the SHAPE driver.
- **Avg Spend per guest** = a SINGLE flat number = the **average of the 7 DOW median spends** (not per-DOW, not since-October global). Display this same flat number on every row as "Avg Target".
- Then **adjust guest counts** so that when multiplied by the flat avg spend, the daily revenue still allocates the monthly target correctly (i.e., guests scaled per day so sum-of-revenue hits remaining target, with daily shape driven by DOW median guests × flat spend baseline).

So essentially: revenue weights per day come from the modal's `(median guests × median spend)` baseline (same as Daily Distribution), but the displayed avg-spend is replaced by the mean-of-7-DOW-medians, and guests are back-solved per day = daily revenue / flat spend.

This keeps the table numerically consistent with the modal at the **monthly total** and **daily revenue distribution** level, while flattening the displayed spend into one number.

## Implementation

### A. `src/utils/forecastDistribution.ts`
Add helper:
```ts
export function meanOfDowMedianSpend(medians: MedianByDOW): number
```
Returns the simple average of the 7 `avgSpendByDow[day]` values (only counting days that have data; if none, 0).

Add new distribution function `distributeMonthlyTargetUniformSpendDowShape`:
- Inputs: `year, month, monthlyTarget, flatSpend, medians (full DOW), actuals`
- Per-day baseline weight = `medians.guestsByDow[dow] * medians.avgSpendByDow[dow]` (matches modal's revenue allocation EXACTLY).
- Daily gross target = `weight / totalWeight × remainingGrossTarget`.
- Guests per day = `round(dailyGross / flatSpend)`.
- avgSpend column for forecast rows = `flatSpend` (uniform).
- Actuals untouched (use real guests + real avg spend).
- Fallback: even split if no medians.

### B. `src/utils/forecastTableData.ts`
Replace current call to `distributeMonthlyTargetFlatSpend` with `distributeMonthlyTargetUniformSpendDowShape`. Replace `computeGlobalMedianSpend` usage with `meanOfDowMedianSpend(dowMedians)` to derive `flatSpend`. Remove the since-October global-median path.

`flatSpend` (= mean of DOW medians) becomes the value shown in `targetSpend` on every row.

### C. `src/components/forecast/ForecastTableView.tsx`
No structural change — column "AVG TARGET" continues to show the uniform `flatSpend`. Just relies on the new builder. Keep multi-venue selection chips, date filters, PNG/Copy.

### Verification
1. Open Daily Distribution modal for Caliente → note its daily Total Sales values.
2. Open Table view, select only Caliente, full month range → daily Fcst Sales values match the modal's per-day Total Sales.
3. AVG TARGET column shows the same number on every row = arithmetic mean of the 7 DOW median spends (not per-DOW spend).
4. Daily Fcst Guests = round(Fcst Sales / 1.1 / AVG TARGET) — varies per day.
5. Sum of forecast-day Fcst Sales ≈ remaining monthly target (target − actuals so far).

### Files
- Edit `src/utils/forecastDistribution.ts` (add 2 helpers; keep existing for backward compat)
- Edit `src/utils/forecastTableData.ts` (swap to new builder)
- No edit needed to `ForecastTableView.tsx`
