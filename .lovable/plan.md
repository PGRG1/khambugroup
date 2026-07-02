## Goal

Make Platform Admin's `venues` table (via the existing `useVenues` hook) the single source of truth for every venue used by the Targets workflow at `/forecast/:venue`. Remove the four hardcoded venue tuples currently in the code. No DB migration, no layout redesign, no changes to Overview / Daily Sales / Reconciliation / other modules.

## Central venue source

- Reuse `useVenues()` (already tenant-scoped via RLS).
- `ForecastInput.tsx` loads venues once and passes what dependants need down through props. No component re-queries venues on its own.
- The "active venue set" used everywhere on the page = `venues.filter(v => v.is_active)`, sorted by `sort_order` then `name`.
- All identifiers passed downstream stay as venue **names** (strings), because `forecasts.venue` and `sales_records.venue` still store names. Venue ids are used only inside the ForecastInput layer to look up / display the current Admin record.

## Widen types

- `src/types/forecast.ts` — change `venue: "Assembly" | "Caliente" | "Hanabi" | "Events"` to `venue: string`.
- `src/utils/forecastTableData.ts` — change `ForecastVenue` from a literal union to `string` (kept as a type alias for readability).
- `src/utils/forecastUtils.ts` (line 97) — drop the literal cast; use `first.venue as string`.
- `src/pages/ForecastInput.tsx` — `ForecastVenue` alias becomes `string`.

No changes to `forecasts`, `sales_records`, `revenue_targets` schemas.

## `src/pages/ForecastInput.tsx`

1. Import `useVenues`. Compute `activeVenues = venues.filter(v => v.is_active)` and `activeVenueNames = activeVenues.map(v => v.name)`.
2. Delete `ALL_VENUES` and the four-key `parseVenueParam` map.
3. New route resolver: normalise `useParams().venue` (lowercase, trim) and match against each active venue's `name` normalised the same way (this covers "assembly" → "Assembly"; handles renames automatically). Result:
   - matched name → use it as initial selection;
   - no match → fall back to the **first active venue** (never "Assembly").
4. `selectedVenues` initialisation from `localStorage`:
   - parse JSON, then `filter(v => activeVenueNames.includes(v))`;
   - drop stale/inactive/removed names;
   - if empty after filter, fall back to the route venue (if valid) else `[activeVenueNames[0]]`.
   - Do this in a `useEffect` that runs when `venues` finishes loading (so hydration happens after the tenant list arrives) and persists the cleaned list back to `localStorage`.
5. Venue chip selector renders from `activeVenues` (not `ALL_VENUES`). "All" button sets `selectedVenues = activeVenueNames`. `isAllVenues` compares to `activeVenueNames.length`. `orderedSelection` uses `activeVenueNames` for ordering.
6. New Entry venue `<select>` iterates `orderedSelection` (subset of active venues). An inactive venue cannot appear because it is never in the active list.
7. Loading gate: if `venuesLoading`, keep the existing loading block.
8. **Empty state**: when `!venuesLoading && activeVenues.length === 0`, render the required message ("No active venues have been configured. Add a venue in Platform Admin before creating revenue targets.") and disable New Entry, Save Target, Generate Preview, Apply Forecast (either by early-returning that section or by not rendering `RevenueTargetPanel` and the New Entry button).
9. Pass `activeVenueNames` into `RevenueTargetPanel` and (via `ForecastTableViewWrapper`) into `ForecastTableView` as a new `allVenues` prop. Remove the `("Assembly" | "Caliente" | "Hanabi" | "Events")[]` casts on lines 664 / 674 — use `string[]`.
10. No hardcoded "Events" behaviour. Historical records referencing venues that no longer exist stay visible in tables/aggregations because merging is done by string match against the record's own `venue`, not against the active list.

## `src/components/forecast/RevenueTargetPanel.tsx`

1. Add prop `allVenues: string[]` (active Admin venue names, ordered).
2. Delete `ALL_VENUES` constant and `Venue` literal type. Use `string` internally.
3. `selectedVenues` initial state: default to `allVenues` (all active) when there is no saved target for the selected month; when a target exists, use its stored `venues` intersected with `allVenues` (drop inactive/removed). Never default to `["Assembly", "Caliente"]`.
4. Re-hydrate `selectedVenues` when `year`/`month`/`allVenues` change so a newly-added Admin venue becomes selectable and a deactivated one is silently dropped.
5. Responsible-Venue chips iterate `allVenues`.
6. `handleApply`: remove the `if (venue === "Events") continue;` filter and the `venue as "Assembly" | "Caliente" | "Hanabi"` cast. Iterate whichever venues are in `perVenue`; write forecasts using the venue string as-is (`forecasts.venue` column is a plain text column — this works regardless of Admin venue names). If Platform Admin later needs to mark venues as non-forecasting, that is a follow-up when the schema exposes such a flag; today no such field exists, and the prompt forbids inventing one or silently excluding by name.
7. Progress-summary label uses the current `selectedVenues` (already dynamic; no change needed beyond removing the literal type).

## `src/components/forecast/ForecastTableView.tsx`

1. Add prop `allVenues: string[]`.
2. Delete `ALL_VENUES`. Every reference to it becomes `allVenues`.
3. `selectedVenues` initial state: `defaultVenues ?? (defaultVenue ? [defaultVenue] : allVenues)`.
4. `orderedSelection` sorts `selectedVenues` using the index in `allVenues`.
5. `effectiveTargetVenues`: `targetVenues && targetVenues.length > 0 ? targetVenues : allVenues`.
6. `isAllSelected` compares against `allVenues`.
7. Add a `useEffect` that removes any `selectedVenues` entries no longer present in `allVenues` (e.g. Admin deactivated a venue while the panel is open); if the result would be empty, reset to `allVenues`.

## `src/utils/forecastUtils.ts`

- Line 97: replace the literal-union cast with `first.venue` (already string). No other changes; `mergeWithActuals` and `aggregateMergedByDate` are already venue-agnostic.

## `src/utils/forecastDistribution.ts`

- Already accepts `venues: string[]`. No code change; only the caller-side types widen.

## `src/utils/forecastTableData.ts`

- Change `ForecastVenue` alias to `string`. Distribution/weight helpers already use `string[]`.

## `ForecastCharts.tsx` / `ForecastKPICards.tsx`

- Verified they contain no hardcoded venue names or fixed tuples; they consume already-filtered/aggregated rows. **No changes**.

## Historical records

- `mergeWithActuals` and `aggregateMergedByDate` key on the record's own `venue` string, so historical rows for renamed or deactivated venues still render with whatever name is stored on the record. No data rewrite. Charts and the aggregated table continue to display them.

## What is NOT changing

- `revenue_targets`, `forecasts`, `sales_records` schemas.
- Statistical target fields added in the previous task.
- Manager Target math, Actual Revenue source (still `sales_records`), approval workflow.
- Layouts, styling, KPI cards, charts.
- Revenue Overview, Daily Sales, Reconciliation, Accounting, Bank, Payments.
- No new hook, no duplicated venue registry, no DB migration.

## Files touched

- `src/types/forecast.ts`
- `src/pages/ForecastInput.tsx`
- `src/components/forecast/RevenueTargetPanel.tsx`
- `src/components/forecast/ForecastTableView.tsx`
- `src/utils/forecastUtils.ts`
- `src/utils/forecastTableData.ts`

## Verification

- TypeScript check and production build (harness runs automatically).
- Manual: with active Admin venues Assembly/Caliente/Hanabi/Events, page behaves as today; deactivate one → disappears from chip selector, New Entry dropdown, Target panel chips, table venue filter; localStorage cleaned. Rename a venue in Admin → new name flows everywhere. Empty Admin list → empty-state message + disabled actions. Invalid `/forecast/xyz` → falls back to first active venue (not Assembly).
