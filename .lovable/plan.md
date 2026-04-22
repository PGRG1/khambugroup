

## Goal
Replace the 2-venue (Assembly/Caliente) single-select picker on the Forecast page with a 4-venue multi-select that supports any combination (incl. "All"), and aggregate every section (KPIs, charts, table, data view) across the chosen venues.

## Changes

### 1. Venue picker — `src/pages/ForecastInput.tsx`
Replace the two `<Link>` buttons (lines 297-300) with a multi-select toggle group:

```
[ All ] [ Assembly ✓ ] [ Caliente ✓ ] [ Hanabi ] [ Events ]
```

- Clicking a venue toggles it in/out of the active set
- "All" selects/deselects every venue
- At least one venue must remain selected (last one can't be deselected)
- Active state = orange/primary background (matches current Assembly button styling)

### 2. Routing & state
- Keep route `/forecast/:venue` for backward compatibility but treat `:venue` as the *initial* selection only.
- Store selected venues in component state: `selectedVenues: ForecastVenue[]` (default = `[venueName]` from URL, fallback `["Assembly"]`).
- Persist last selection to `localStorage` (`forecast.selectedVenues`) so it survives reloads.
- Update the page header: when 1 venue → "Assembly Forecast"; when >1 → "Assembly + Caliente Forecast"; when all 4 → "All Venues Forecast".

### 3. Aggregation logic
Update the existing memoized derivations:

- **`venueForecasts`** — filter `forecasts` where `selectedVenues.includes(f.venue)`. When >1 venue, group by `date` and sum: `forecastedCustomers`, `forecastedGrossSales`, `forecastedServiceCharge`, `forecastedTotalSales`. Recompute `forecastedAvgSpend` as `grossSales / customers`. Concatenate `comment / forecastNotes / postEventNotes` with " | " separator and a venue tag prefix so context isn't lost.
- **`venueSalesData`** — filter sales where `selectedVenues.includes(s.venue)` (no need to pre-aggregate; `mergeWithActuals` already groups by date+venue, and we'll switch it to date-only when multi-select is active — see below).
- **`mergeWithActuals`** — add an optional `aggregateByDateOnly: boolean` flag. When true, group all records (forecast + actuals) by date alone, summing numeric fields and recomputing avg spend.

### 4. Sub-components that already accept multi-venue
- **`RevenueTargetPanel`** — already venue-aware (uses `targetVenues` from saved target). No change.
- **`ForecastTableView`** — `ForecastTableViewWrapper` already supports `defaultVenue`; extend it to accept `defaultVenues: ForecastVenue[]` and pre-select all of them in the table's internal venue selector.
- **`ForecastKPICards`** and **`ForecastCharts`** — already render whatever `data` array we pass in, so they "just work" once `filteredData` is the aggregated set.

### 5. New Entry form
A forecast entry must still belong to one venue. When multiple venues are selected, the New Entry form shows an extra "Venue" dropdown (defaulting to the first selected venue) so the user picks which venue this single entry is for. When only one venue is selected, the dropdown is hidden and that venue is used.

### 6. Data table (`showTable` block)
Add a "Venue" column (only when >1 selected) so the user can still see which venue each row belongs to. Title becomes `Forecast vs Actuals — Assembly + Caliente (N records)`.

### Files touched
- `src/pages/ForecastInput.tsx` — picker, state, aggregation wiring, header, New Entry venue dropdown, table venue column
- `src/utils/forecastUtils.ts` — `mergeWithActuals` gains `aggregateByDateOnly` mode + small `aggregateForecastsByDate` helper
- `src/components/forecast/ForecastTableView.tsx` — accept `defaultVenues` (plural) prop
- `src/types/forecast.ts` — widen `ForecastRecord.venue` union to include `"Events"` (currently only Assembly/Caliente/Hanabi)
- `src/components/AppSidebar.tsx` — add Hanabi and Events forecast nav links beside the existing Assembly/Caliente entries (so the nav matches the new picker)

## Out of scope
- No DB schema change. Existing `forecasts.venue` column already accepts any text.
- Approval workflow, permissions, audit logging — unchanged.
- Visual style — reuses the existing toggle button styling on the page.

