
User wants 4 changes to ForecastTableView:

1. **Remove "Combined"** chip — it duplicates "All Venues". Keep only: `All Venues | Assembly | Caliente | Hanabi | Events`. "All Venues" = aggregated combined view (one table).

2. **Multi-select venue chips** — clicking Assembly then Caliente selects both, showing one combined table for just those two venues. "All Venues" remains a one-click shortcut that selects all four.

3. **Rename "Target Spend" column → "Avg Target"**.

4. **Change spend baseline logic**: instead of per-DOW median, use a **single global median avg-spend** computed across ALL historical sales since **October (of the earliest available year)** for the selected venues. Apply this same spend uniformly to every day. Then **redistribute guests** so daily revenue still hits the venue's daily target — but with a flat spend per guest, guests vary purely by daily revenue allocation.

## Implementation

### A. `src/utils/forecastDistribution.ts` — new helper
Add `computeGlobalMedianSpend(salesData, venues, sinceIso)` that returns median of (totalSales/1.1)/guests across all qualifying days since Oct 1 of the earliest data year (or a fixed `2024-10-01` if simpler — confirm via question if needed; default: October of (currentYear-1) if currentMonth>=10 else (currentYear-2), i.e. the most recent past October).

Add `distributeMonthlyTargetFlatSpend({year, month, monthlyTarget, flatSpend, dowGuestsForShape, actuals})` — same as `distributeMonthlyTarget` but:
- avgSpend = `flatSpend` for every forecast day
- per-day revenue still allocated using DOW guest medians as the *shape* (so busy days get more revenue), but guests = revenue / flatSpend
- actuals untouched

### B. `src/utils/forecastTableData.ts` — wire new logic
- Accept selected venues array (≥1).
- Compute one combined `flatSpend` from the union of selected venues' history since Oct.
- Compute combined DOW guest medians (across selected venues) for the shape.
- Compute combined actuals (sum across selected venues).
- Run `distributeMonthlyTargetFlatSpend` once → returns the single combined table.
- Drop per-venue split tables entirely (since UI shows one combined table for the selection).
- Each row's `targetSpend` = `flatSpend` (same number every row).

### C. `src/components/forecast/ForecastTableView.tsx`
- Replace single-select chip row with multi-select toggleable chips. State: `selectedVenues: ForecastVenue[]`.
  - "All Venues" chip = shortcut: sets selection to all four; highlighted when all four selected.
  - Clicking a venue chip toggles it in/out of `selectedVenues` (min 1 — can't deselect last).
  - Remove "Combined" chip.
- Header label:
  - 4 selected → "All Venues"
  - 1 selected → that venue name
  - 2-3 selected → "Assembly + Caliente" style
- Rename column header `TARGET SPEND` → `AVG TARGET`.
- Render only ONE table (the combined-for-selection table). Remove the stacked per-venue tables path.
- Keep date filter, presets, Copy/Download PNG.

### D. `src/pages/ForecastInput.tsx`
No prop changes needed; the wrapper already passes salesData/year/month/target. Default `selectedVenues` initializes to the page's venue (e.g. /forecast/assembly → ['Assembly']).

### Files
- Edit `src/utils/forecastDistribution.ts` (add 2 helpers)
- Edit `src/utils/forecastTableData.ts` (simpler — single combined output)
- Edit `src/components/forecast/ForecastTableView.tsx` (multi-select chips, rename column, single table)

### Verification
1. /forecast/assembly → only Assembly chip active, single table shows Assembly.
2. Click Caliente → both highlighted, header "Assembly + Caliente", numbers = combined for those 2 only.
3. Click All Venues → all 4 highlighted, full combined table.
4. Avg Target column shows the same value on every row (the global median since Oct).
5. Sum of Fcst Sales for forecast days ≈ remaining target.
6. No "Combined" chip visible.
