## Goal

Extend the revenue model so events become a **Revenue Source** (not a venue) and off-site activity has a real location, while keeping every existing sales record, forecast, dashboard, chart, filter, and total **byte-for-byte identical**.

No deletes. No renames. No reset. No overwrite of historical totals.

---

## Current state (verified)

- `sales_records.venue` is `text` with a CHECK constraint: `Assembly | Caliente | Hanabi | Events`. Today: 215 Assembly + 214 Caliente rows. **Zero "Events" rows exist**, but we'll still treat Events as legacy-safe per your spec.
- `forecasts.venue` same 4 values (no CHECK, plain text).
- TypeScript union `"Assembly" | "Caliente" | "Hanabi" | "Events"` is referenced across 27 files (types, dashboards, forecast, HR, finance mappings, scanner, manual entry).

---

## Plan

### 1. Database migrations (additive only)

**a. Relax CHECK constraint on `sales_records.venue`** to allow new value `Off-site / External` (and keep `Events` for legacy/admin edits):
```
DROP CONSTRAINT sales_records_venue_check;
ADD CONSTRAINT sales_records_venue_check
  CHECK (venue IN ('Assembly','Caliente','Hanabi','Events','Off-site / External'));
```

**b. New table `revenue_sources`** (configurable, seeded with the 8 sources you listed):
```
id, name (unique), is_active, sort_order, is_default, created_at, updated_at
```
Seed: Restaurant Sales (default), Events, Delivery, Takeaway, Catering, Private Dining, Pop-up / Stall, Other.

**c. New table `events`**:
```
id, name, event_type, linked_venue (nullable), external_location (nullable),
start_date, end_date, revenue_source_id (default = Events),
service_period, sales_channel, expected_guests, forecast_avg_spend,
forecast_revenue, actual_guests, actual_revenue, notes,
status (Planned|Active|Completed|Cancelled), include_in_dashboard (bool, default true),
created_by, created_at, updated_at
```

**d. New table `venues_config`** (so `Off-site / External` can be marked external + Events marked legacy without touching sales):
```
name (PK), display_label, venue_type (physical|external|legacy), is_active,
include_in_dashboard, include_in_forecasting, include_in_inventory,
include_in_payroll, sort_order
```
Seeded:
- Assembly / Caliente / Hanabi → physical, active, sort 1–3
- Off-site / External → external, active, sort 4
- Events → legacy, **inactive for new entries**, historical-only flag = true, sort 99

**e. Extend `sales_records` with optional columns** (all nullable, no defaults that would alter history):
```
revenue_source_id uuid NULL,
event_id uuid NULL,
event_name text NULL,
external_location text NULL,
service_period text NULL,
sales_channel text NULL
```

**f. Extend `forecasts` with the same optional columns** (revenue_source_id, event_id, external_location, service_period, sales_channel) — all nullable.

**g. RLS**: read = authenticated; write = admin/manager. Same pattern as existing tables.

**h. One-time backfill (idempotent, only fills NULLs)**:
```
UPDATE sales_records SET revenue_source_id = (SELECT id FROM revenue_sources WHERE name='Restaurant Sales')
  WHERE revenue_source_id IS NULL AND venue IN ('Assembly','Caliente','Hanabi');
UPDATE sales_records SET revenue_source_id = (SELECT id FROM revenue_sources WHERE name='Events')
  WHERE revenue_source_id IS NULL AND venue = 'Events';
```
No totals, no venue values, no historical records are touched.

### 2. TypeScript types (extend, never narrow)

- `SalesRecord.venue` and `ForecastRecord.venue` → widen to `"Assembly" | "Caliente" | "Hanabi" | "Events" | "Off-site / External"`.
- Add optional fields on `SalesRecord` and `ForecastRecord`: `revenueSourceId?`, `eventId?`, `eventName?`, `externalLocation?`, `servicePeriod?`, `salesChannel?`.
- New types: `RevenueSource`, `EventRecord`, `VenueConfig`.

### 3. Hooks

- New `useRevenueSources()`, `useEvents()`, `useVenuesConfig()` (read + admin CRUD).
- Extend `useSalesData` `toDbRecord` / `fromDbRecord` to include the 6 new optional fields. Backwards-compatible: missing values stay `null`.
- Extend `useForecastData` similarly.

### 4. Sales entry forms (`ManualInput`, `ReceiptScanner`, forecast input)

- Venue dropdown for **new entries** is driven by `venues_config WHERE is_active = true` → shows Assembly, Caliente, Hanabi, Off-site / External (NOT Events).
- "Events (Legacy)" only appears when editing an existing Events row in admin/historical edit mode.
- Add Revenue Source dropdown (default Restaurant Sales).
- Conditional fields:
  - Revenue Source = Events → show Event selector + Sales Channel
  - Venue = Off-site / External OR event_type ∈ {External Stall, Pop-up, Catering, Festival, Takeaway Booth} → External Location required
  - Otherwise hide Event selector + External Location
- Service Period dropdown always visible (Breakfast / Lunch / Dinner / Event / etc.) — optional.

### 5. New "Events" admin page

- CRUD for the `events` table (Admin/Manager).
- Lives under Revenue sidebar group as "Events".
- Per the spec's event types and statuses.

### 6. Dashboard / charts / reports — strictly additive

- All current KPIs, charts, totals, mappings stay **unchanged** in calculation.
- Add filter chips/dropdowns alongside existing ones: Revenue Source, Event Type, Event, Service Period, Sales Channel. Default = "All" so existing visuals render identically.
- Venue chip filter keeps current 4 venues + adds "Off-site / External". "Events (Legacy)" appears only when historical Events data exists (currently zero rows, so it stays hidden until used).
- New optional breakdowns (additional cards/charts, not replacements): Revenue by Revenue Source, by Event Type, by Event, by Service Period, by Sales Channel.

### 7. Forecast vs Actual

- Add same optional fields to forecast input form. Existing forecast math untouched. Variance comparison continues to key on `(date, venue)` exactly as today; new fields are display-only metadata until you ask for grouped forecasts.

### 8. Settings / Admin

- New "Revenue Sources" admin panel (rename, activate/deactivate, reorder).
- New "Venues" admin panel reading `venues_config` (toggle active, change display label, reorder). Events row is locked to legacy.

### 9. Safety guarantees

- No `DELETE`, no `UPDATE` on existing non-NULL columns.
- CHECK constraint only **widened**, never tightened.
- All new columns nullable — existing inserts/updates from older code paths keep working.
- Existing Supabase views, `rebuild_journal_from_operations`, accounting mapping rules, reconciliation logic are not modified (they read venue + amounts only).
- No changes to storage buckets, edge functions, or auth.

---

## Files to add / change (technical)

**New**
- Migration: tables `revenue_sources`, `events`, `venues_config`; new columns on `sales_records` + `forecasts`; widened CHECK; backfill; RLS.
- `src/hooks/useRevenueSources.ts`, `useEvents.ts`, `useVenuesConfig.ts`
- `src/types/revenueSource.ts`, `src/types/event.ts`, `src/types/venueConfig.ts`
- `src/pages/Events.tsx` + `src/components/events/EventsTable.tsx` + `EventEditorDialog.tsx`
- `src/components/admin/RevenueSourcesPanel.tsx`, `VenuesConfigPanel.tsx` (add to Settings)
- `src/components/dashboard/RevenueSourceFilter.tsx`, `EventFilter.tsx`, `ServicePeriodFilter.tsx`, `SalesChannelFilter.tsx`

**Edit (non-destructive widenings only)**
- `src/types/sales.ts`, `src/types/forecast.ts` — widen union, add optional fields
- `src/hooks/useSalesData.ts`, `src/hooks/useForecastData.ts` — map new columns
- `src/components/dashboard/ManualInput.tsx`, `ReceiptScanner.tsx`, `DataTable.tsx`, `DashboardCharts.tsx`, `DashboardHeader.tsx` — venue list from config + new optional UI
- `src/pages/ForecastInput.tsx`, `src/components/forecast/ForecastTableView.tsx` — new optional fields
- `src/pages/Settings.tsx` + `src/components/AppSidebar.tsx` — register new admin panels + Events page
- `src/constants/venueSeating.ts` — keep defaults; read overrides from `venues_config`

No edits to: `salesUtils.ts` math, `rebuild_journal_from_operations`, accounting mapping matrices, payroll mapping, finance views, reconciliation, storage code.

---

## What you'll see when this ships

- Existing dashboards and totals: identical.
- New entry form: Venue list = Assembly, Caliente, Hanabi, Off-site / External. Revenue Source defaults to Restaurant Sales. Event/External Location appear conditionally.
- New sidebar item: **Events** (Admin/Manager).
- New Settings panels: **Revenue Sources**, **Venues**.
- Dashboard gets extra filters and breakdown charts; old filters all still there.
