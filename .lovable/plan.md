## Goal

Make Daily Register expanded sub-rows show real period names and real per-period Actual Revenue / Guests / SPG, by tagging `sales_records` with a `venue_service_periods` row at entry time and reading those tags back on the Revenue Targets page.

## Key decision

Reuse the existing `sales_records.service_period_id` column — it already FKs to `venue_service_periods(id) ON DELETE SET NULL` and is already indexed. **No migration needed.** Skip step 1 of the original scope entirely.

## Changes

### 1. Types + mapping — `src/hooks/useSalesData.ts`
- Add `servicePeriodId?: string | null` to the `SalesRecord` type (if not already present).
- `toDbRecord`: include `service_period_id: r.servicePeriodId ?? null`.
- `fromDbRecord`: `servicePeriodId: r.service_period_id ?? null`.
- Leave the legacy free-text `service_period` string field untouched.

### 2. `src/pages/DataPage.tsx`
- Plumb `servicePeriodId` through `addRecord` so every entry path persists it.

### 3. `src/components/dashboard/ManualInput.tsx`
- Resolve venue id from the selected venue via `useVenues()`.
- Load operational periods with `useVenueServicePeriods([venueId])`, filtered to `isActive && !isRollupOnly`.
- Behavior by count:
  - **0 periods** → save untagged (backwards compatible, no UI).
  - **1 period** → auto-set `servicePeriodId` at submit; render read-only `Period: <name> (auto-tagged)`.
  - **2+ periods** → required `<Select>`; block submit until picked; clear selection when venue changes.

### 4. `src/pages/SalesRecordDetail.tsx`
- **Edit mode**: Service Period `<Select>` right after Venue, bound to `draft.servicePeriodId`. Options from `useVenueServicePeriods([draft.venueId])` filtered the same way. Always include a "Not tagged" option so users can clear.
- **Read-only mode**: display resolved period name, or `"Not tagged"` when null. Never render the raw uuid.

### 5. `src/hooks/useRevenueTargetActuals.ts`
- Extend the underlying select to include `service_period_id`.
- Keep the existing full-day rows/return shape exactly as-is (no breaking change for current consumers).
- Add a new `byPeriod: Map<string, { revenue: number; guests: number; spendPerGuest: number }>` keyed by `${venueId}__${date}__${servicePeriodId}`. Rows with `service_period_id IS NULL` are not aggregated into `byPeriod`; they stay in full-day totals as before.
- `spendPerGuest = guests > 0 ? revenue / guests : 0`.

### 6. `src/pages/RevenueTargets.tsx` — DailyRegister expanded sub-rows
- Replace the hardcoded `"Full Day"` label with the real `venue_service_periods.name` looked up from `useVenueServicePeriods([venueId])`.
- Read per-period Act Rev / Guests / SPG from the new `byPeriod` map instead of showing `"Unavailable"`.
- If a period has no matching sales row for that date, render an em-dash (`—`), not the string "Unavailable".

## Non-goals

- No new column, no new index, no migration.
- No automatic time-of-day backfill — historical untagged rows stay untagged until edited via SalesRecordDetail.
- `service_periods` (GL-mapping) and any code that references it stays untouched.
- No changes to the free-text `service_period` string column.

## Verification I will run and report back in chat

1. `SELECT COUNT(*) FROM sales_records WHERE service_period_id IS NULL;` before and after tagging a test record via ManualInput.
2. Create a sales record for a single-period venue (e.g. Hanabi or Arca) → confirm no selector is shown and the resulting row has `service_period_id` populated.
3. **Multi-period path**: temporarily `UPDATE venue_service_periods SET is_active = true WHERE id = '73a04371-1621-45f3-83d2-9f9518c886b5'` (Assembly "Full Day"), confirm ManualInput now renders the required `<Select>` for Assembly and blocks submit until a period is chosen, then revert with `UPDATE ... SET is_active = false`.
4. Pick a recent date with a newly tagged Assembly row and query it joined to `venue_service_periods`; report the period name and per-period Act Rev / Guests / SPG numbers to confirm they replace the old "Full Day" / "Unavailable" placeholders in the expanded DailyRegister row.

## Technical notes

- Actual venues in DB (confirmed): Test Venue, Assembly, Caliente, Hanabi, Off-Site / Stall (inactive), Arca. No "Events" row — earlier draft was wrong.
- Every currently active venue has exactly **one** active non-rollup period today:
  - Assembly → Late Operation (Full Day inactive, Full Day (Benchmark) rollup-only)
  - Caliente → Late Operation (Full Day (Benchmark) rollup-only)
  - Hanabi, Arca, Test Venue → Full Day
- Result: the required `<Select>` branch in ManualInput is **dormant with today's data** — every entry auto-tags. The branch still needs to exist for future multi-period configurations.
- Rollup-only periods are excluded from ManualInput/SalesRecordDetail selectors and DailyRegister expanded lists (existing `isRollupOnly` semantics).
- Keep the `service_period_id` FK's `ON DELETE SET NULL` behavior — deleting a period detags sales rows rather than deleting them.
