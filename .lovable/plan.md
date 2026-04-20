
User wants ForecastTableView to:
1. **Match the figures from "Daily Distribution"** logic (uses DOW median guests × avg spend, weighted by venue's historical share, with actuals preserved). Currently the table uses raw `forecasts` table (`forecastedTotalSales`, `forecastedCustomers`) which differs.
2. **Reorder columns**: group Forecast (Sales + Guests + Avg Spend target) together, then Actuals (Sales + Guests) together. Add "Target Spend / Guest" column.
3. **Venue switcher inside the table view** (All venues + Combined), similar to Revenue tab — not tied to the URL page.

Let me check ForecastInput page structure & how revenue tab does venue switching.

Looking at the existing data flow:
- `ForecastInput.tsx` is per-venue (route param). Table currently scoped to one venue.
- `RevenueTargetPanel` already computes the "Daily Distribution" via `distributeMonthlyTarget` + `computeVenueWeights` + `aggregateActualsByVenue`.
- For the table to mirror those numbers, it must use the same calc engine and the **active monthly revenue target** for the displayed month.

## Plan

### 1. New shared helper `src/utils/forecastTableData.ts`
Single function `buildForecastTableRows({ year, month, venues, salesData, monthlyTarget })`:
- Calls `computeVenueWeights` → per-venue share
- For each venue: `computeDowMedians` + `aggregateActualsByVenue` + `distributeMonthlyTarget(venueTarget…)`
- Returns `{ perVenue: Record<venue, DistributedDay[] & {targetSpend}>, combined: DistributedDay[] }`
- Combined = sum of per-venue rows by date (guests sum, totalSales sum, weighted avg spend)

This guarantees the table view = Daily Distribution numbers exactly.

### 2. Refactor `ForecastTableView.tsx`
Props change from `(data, venueName)` → `(year, month, salesData, monthlyTarget, defaultVenue?)`.

Add internal state:
- `venueScope`: `"All Venues" | "Assembly" | "Caliente" | "Hanabi" | "Events" | "Combined"` — chip-row selector at top (mirroring Revenue tab pattern from `mem://layout/revenue-tabbed-interface`).
  - `All Venues` = render one table per venue stacked
  - `Combined` = single aggregated table
  - Specific venue = single table for that venue
- Keep date-range filter + Copy/Download PNG (per-table buttons so each venue's table screenshots independently).

Column order (new):
| Date | Day | Status | **Fcst Guests** | **Fcst Avg Spend** | **Fcst Sales** | **Actual Guests** | **Actual Avg Spend** | **Actual Sales** | Variance |

"Status" badge: `Actual` (green) / `Forecast` (orange) — matches the Daily Distribution modal styling.

Footer totals row: sum guests, sum sales, weighted avg spend, variance.

### 3. Integration in `ForecastInput.tsx`
- The page is currently per-venue. Change the Table view branch to render one `ForecastTableView` that internally handles the venue switcher (defaulting to current page's venue).
- Pass `salesData` (already loaded), `monthlyTarget` (fetch active `revenue_targets` row for current month/year covering the venues in scope), and current `year`/`month`.
- If no monthly target exists → fall back to using stored `forecasts` rows (current behavior) and show a small note "No active revenue target — showing saved forecasts".

### 4. Edge cases
- Month selector for the table: add a month dropdown (default = current month) so user can flip months without changing the page route.
- "All Venues" stacked view → each venue table has its own date-range filter? → Keep one shared date filter at top for simplicity; each table has its own download button.
- Combined view weighted avg spend = `totalSales / totalGuests` per row.

### 5. Files
- **Create** `src/utils/forecastTableData.ts`
- **Edit** `src/components/forecast/ForecastTableView.tsx` — full refactor
- **Edit** `src/pages/ForecastInput.tsx` — pass new props (salesData, year, month, target lookup)

### Verification
1. /forecast/caliente → Table view → numbers in Caliente table match "Daily Distribution → Caliente" exactly (guests, avg spend, totalSales per day).
2. Switch venue chip to "Assembly" → see Assembly table matching its Daily Distribution.
3. Switch to "Combined" → totals match the modal's overall projected total.
4. Switch to "All Venues" → see Assembly + Caliente + Hanabi + Events tables stacked, each with its own download PNG button.
5. Column order shows Fcst Guests / Fcst Spend / Fcst Sales together, then Actual Guests / Spend / Sales.
