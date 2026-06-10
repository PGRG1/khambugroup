# KPI Management — v1 Plan

A new ownership-driven module where admins/managers define KPI cards + targets, assign them to users/roles/venues, and each user logs in to see only the KPIs they own. Actuals are entered manually (POS-live integration left as future work via an `actual_source` field).

## 1. Pages & navigation

New sidebar group **KPI Management** with three pages:

1. `/kpis/my-cards` — **My KPI Cards** (default landing for non-admins)
2. `/kpis/assignments` — **KPI Assignment** (admin only)
3. `/kpis/targets` — **KPI Targets** (admin only)

Wiring:
- Add `kpi-management` (admin pages) and `kpis` (my cards) page keys in `src/utils/permissions.ts` + `handle_new_user_access()` trigger.
- Sidebar entry in `src/components/AppSidebar.tsx` between Revenue and Procurement, using a `Target` lucide icon. Group collapses for standard users to just "My KPIs".
- After login, if the user is non-admin and has any active assignment, redirect `/` → `/kpis/my-cards`. Admins keep Revenue as landing.

## 2. Data model (one migration)

All tables in `public`, with GRANTs + RLS, `updated_at` trigger.

### `kpi_cards`
Master definition of a KPI (template).
- `id`, `kpi_name`, `kpi_category` (`revenue` | `procurement` | `custom`), `kpi_type` (`mtd_revenue` | `daily_revenue` | `daily_guests` | `daily_per_guest_spend` | `custom`), `unit` (`currency`|`count`|`percent`), `description`, `active`, timestamps.

### `kpi_targets`
A target row scoped by venue + (optional) day-of-week + (optional) period.
- `id`, `kpi_card_id`, `venue_id` (nullable = all venues), `assigned_user_id` (nullable), `assigned_role` (nullable text, e.g. `manager`), `target_value numeric`, `target_period` (`day`|`week`|`month`), `period_start_date`, `period_end_date` (nullable for recurring), `calculation_method` (`manual`|`venue_specific`|`day_of_week`|`mtd`), `day_of_week smallint` (0–6, nullable), `warning_threshold_pct numeric default 10`, `critical_threshold_pct numeric default 20`, `active`, timestamps.

### `kpi_assignments`
Who is responsible for which KPI card, scoped to venue(s).
- `id`, `kpi_card_id`, `assigned_user_id` (nullable), `assigned_role` (nullable), `venue_id` (nullable = all), `assigned_by`, `assigned_at`, `active`.
- Supports multi-venue by inserting multiple rows; UI presents as a multi-select.

### `kpi_actuals`
Manual actuals snapshots.
- `id`, `kpi_card_id`, `venue_id`, `period_date` (the date the actual belongs to — for MTD this is the first of month), `actual_value numeric`, `notes`, `actual_source text default 'manual'` (future: `pos_live`|`imported`|`calculated`), `updated_by`, `updated_at`.
- Unique on (`kpi_card_id`, `venue_id`, `period_date`).

### `kpi_actions` (lightweight follow-up log)
- `id`, `kpi_card_id`, `venue_id`, `period_date`, `assigned_user_id`, `action_required text`, `action_status` (`open`|`in_progress`|`done`), `due_date`, `completed_date`, `notes`, timestamps.

### RLS
- Admins (`has_role admin`): full CRUD on all tables.
- Standard users: SELECT on `kpi_cards` (active only) and on `kpi_targets`/`kpi_assignments`/`kpi_actuals`/`kpi_actions` where they appear in any active `kpi_assignments` row for that card (helper SQL function `user_owns_kpi(uid, card_id)`). INSERT/UPDATE on `kpi_actuals` + `kpi_actions` for cards they own.

## 3. Status logic (shared util)

`src/utils/kpiStatus.ts`:

```text
if no kpi_actuals row for the period → Pending Actual Update
else:
  variance% = (actual - target) / target * 100   (sign-aware per KPI direction)
  for "higher is better" (revenue, guests, spend):
     >= 0          → On Track
     within -warn% → Watch
     within -crit% → Behind
     beyond -crit% → Critical
  Action Required flag is set manually via kpi_actions
```

Render with existing `<StatusBadge>` chips (`success/info/warn/danger/neutral`).

## 4. My KPI Cards page

- Header: greeting + count of cards owned.
- Grid of cards (`card-glass`, `KpiCard` primitive), each shows:
  - KPI name + venue chip + period label
  - **Target** (big number, JetBrains Mono `.td-num`)
  - **Actual** (or "Not updated yet")
  - Variance value + % with arrow icon
  - Status chip
  - Required action (latest open `kpi_actions` row, if any)
  - "Last updated 3h ago by Jane" footer
  - "Update Actual" button → modal: actual_value, notes → writes to `kpi_actuals`
- Filter chips: venue, period (Today / This Month), status.

## 5. KPI Assignment page (admin)

Table view of all active assignments grouped by KPI card. Toolbar: "+ New Assignment".
Dialog fields:
- KPI Card (Select from active cards)
- Assign to: tabs `User` / `Role` / `Venue-wide`
- Venues: multi-select chips
- Active toggle
Row actions: edit, reassign, deactivate. Inline status chip.

## 6. KPI Targets page (admin)

Spreadsheet-style table. Toolbar: "+ New Target" + filters (KPI, Venue, Active).
Dialog fields match the schema, with conditional inputs:
- If `calculation_method = day_of_week`, show 7 weekday rows in one dialog so the admin sets Mon–Sun targets per venue at once.
- Warning/critical thresholds default 10% / 20%.
- Active toggle.

## 7. Seed data (insert tool after migration)

Four `kpi_cards`:
- "Month-to-Date Revenue Target" — `mtd_revenue`, currency
- "Daily Revenue Target" — `daily_revenue`, currency
- "Daily Guest Count Target" — `daily_guests`, count
- "Daily Per Guest Spend Target" — `daily_per_guest_spend`, currency

(Roles, venues, and users already exist — no extra sample users created.)

## 8. Out of scope (deferred)

- KPI Rules page + historical day-of-week auto-computation from `sales_records`.
- Procurement KPI cards (Invoice Upload Delay, Missing Invoices, Supplier Follow-up).
- Auto-pulling actuals from POS/sales tables.
- Push notifications when a KPI flips to Critical.

## Technical summary

- 1 migration: 5 new tables + helper `user_owns_kpi` + GRANT/RLS + update_at trigger.
- 1 insert call: seed 4 KPI cards.
- New files: `src/pages/kpis/MyKpis.tsx`, `KpiAssignments.tsx`, `KpiTargets.tsx`; `src/hooks/useKpiCards.ts`, `useKpiAssignments.ts`, `useKpiTargets.ts`, `useKpiActuals.ts`; `src/utils/kpiStatus.ts`; `src/components/kpi/KpiCardTile.tsx`, `UpdateActualDialog.tsx`, `AssignmentDialog.tsx`, `TargetDialog.tsx`.
- Edits: `src/App.tsx` (routes + post-login redirect), `src/components/AppSidebar.tsx`, `src/utils/permissions.ts`, `handle_new_user_access` trigger (add `kpis`, `kpi-management` keys).
