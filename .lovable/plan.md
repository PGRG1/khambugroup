
## Issue
The table passes the **full monthly target (800k)** to whatever venues the user has chip-selected. The saved target row covers `{Assembly, Caliente}` jointly = 800k, but selecting just "Assembly" makes the engine try to hit 800k from Assembly alone → guests inflate massively (e.g. 406 on a Friday). The Daily Distribution modal already solves this via `computeVenueWeights` to allocate the target proportionally — the table needs the same treatment.

## Fix

### 1. `src/utils/forecastTableData.ts`
Apply the venue-share weighting before distributing:
- Take the saved target's **owning venues** (from `revenue_targets.venues`, e.g. `[Assembly, Caliente]`) and the saved `targetAmount`.
- New params: `targetVenues: ForecastVenue[]` (the venues the target was set for), keep existing `monthlyTarget`.
- Call `computeVenueWeights(salesData, targetVenues, 3)` → per-venue share of the 800k.
- The **scoped target** for the user-selected `venues` chip subset = `monthlyTarget × Σ(weights[v] for v in selectedVenues ∩ targetVenues)`.
  - If selection is `[Assembly]` and weights are `{Assembly: 0.55, Caliente: 0.45}` → scoped target = 440k.
  - If selection is `[Assembly, Caliente]` (matches target venues) → 800k.
  - If selection includes a venue NOT in `targetVenues` (e.g. Hanabi) → that venue contributes 0 (no target allocated). Surface a warning.
- Pass `scopedTarget` (instead of raw `monthlyTarget`) to `distributeMonthlyTargetUniformSpendDowShape`.

### 2. `src/pages/ForecastInput.tsx` (`ForecastTableViewWrapper`)
Pass `targetVenues={target?.venues ?? []}` alongside `monthlyTarget`.

### 3. `src/components/forecast/ForecastTableView.tsx`
- Accept new prop `targetVenues: string[]`.
- Forward to `buildForecastTableData`.
- Header `Target: …` badge already shows the scoped amount (now correct).
- Add a small note when `selectedVenues` ⊄ `targetVenues`: e.g. `"Target set for Assembly + Caliente — Hanabi has no allocated target"`.

### 4. Column rename
- Header `Avg Target` → **`Avg Spend per Guest Target`**.
- Top badge `Avg Target: …/guest` → `Avg Spend Target: …/guest`.

### 5. Files
- Edit `src/utils/forecastTableData.ts` (add targetVenues weighting)
- Edit `src/components/forecast/ForecastTableView.tsx` (rename column, accept targetVenues, warning note)
- Edit `src/pages/ForecastInput.tsx` (pass targetVenues to wrapper)

### Verification
1. /forecast/assembly, April 2026, target=800k for {Assembly, Caliente}. Select only Assembly → header shows scoped target ≈ 800k × Assembly's historical share (e.g. ~440k), Fcst Sales total over remaining days ≈ scoped target − Assembly actuals so far. Guest counts return to realistic levels (~100-200/day, not 400+).
2. Select Assembly + Caliente → header shows full 800k, totals match the Daily Distribution modal exactly.
3. Select Hanabi (not in target venues) → warning chip "No target allocated", numbers go to 0/—.
4. Column header reads `AVG SPEND PER GUEST TARGET`.
