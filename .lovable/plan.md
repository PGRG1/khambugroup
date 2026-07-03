# Step 4 — Statistical Revenue Target (final, read-only client access)

Adds the Statistical Target series on `/forecast/:venue` computed **entirely server-side** from `sales_records`, with the daily table **read-only to normal clients**. All writes flow exclusively through the SECURITY DEFINER RPC.

## Security model (this correction)

- `revenue_statistical_targets_daily`
  - `GRANT SELECT ON public.revenue_statistical_targets_daily TO authenticated;`
  - `GRANT ALL ON public.revenue_statistical_targets_daily TO service_role;`
  - **No** `INSERT`/`UPDATE`/`DELETE` grants to `authenticated`. **No** `anon` grant.
  - RLS policies (single `FOR SELECT` policy for authenticated + implicit service_role bypass):
    - `SELECT`: `is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id)`
    - **No** `FOR ALL`, `FOR INSERT`, `FOR UPDATE`, or `FOR DELETE` policy for `authenticated`. Without a write policy and without table-level write grants, direct client writes are rejected twice over.
- `generate_statistical_targets_month(p_tenant_id, p_year, p_month, p_venue_ids uuid[], p_model_version text)`
  - `SECURITY DEFINER`, `SET search_path = public`, owned by `postgres`.
  - `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon;`
  - `GRANT EXECUTE ON FUNCTION ... TO authenticated, service_role;`
  - Inside the function (unchanged from the previous revision):
    1. Require `auth.uid() IS NOT NULL`.
    2. Require `is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), p_tenant_id)`.
    3. Require `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR is_super_admin(auth.uid())` — the existing Manager/Admin gate used by `useForecastPermissions`.
    4. Validate `year/month`, non-empty `p_venue_ids`, `p_model_version = 'same_weekday_median_12w_v1'`.
    5. Reject any `venue_id` that doesn't belong to `p_tenant_id`.
  - Because the RPC is DEFINER-owned by `postgres` (bypasses RLS/grants) and the client role has no write grants on the table, the RPC is the **only** write path.

## Statistical logic (unchanged from prior revision)

- Lookback = 12 complete weeks (84 days) ending the day before the target month.
- Aggregate `sales_records` to `(venue, business_date)` daily totals via `SUM(total_sales)`.
- `percentile_cont(0.5)` per `(venue_id, weekday)` over those daily totals.
- Stage every target-month day per venue. If any `(venue, weekday)` has zero observations → return `{ ok:false, reason:'insufficient_history', missing:[...] }` and **write nothing** (atomic).
- Otherwise atomic replace: `DELETE` scope's rows for the month, `INSERT` fresh rows (`confidence = high` when `obs≥4`, else `low`, `generated_by = auth.uid()`).
- Recompute `revenue_targets.statistical_target_amount` = `SUM` of the table for that tenant/month.
- If `revenue_targets` row exists → patch only `statistical_target_amount`, `statistical_model`, `statistical_generated_at`. Never touch `target_amount`, `venues`, `notes`, `created_by`. If it doesn't exist → insert with `target_amount = NULL`, `venues = Responsible Venue names`, `notes = ''`, `created_by = auth.uid()` (schema-verified).

## Migrations

Two migrations are already applied. This step ships **one additional migration** to enforce the read-only posture:

1. `REVOKE INSERT, UPDATE, DELETE ON public.revenue_statistical_targets_daily FROM authenticated;` (defensive, in case the earlier grant was broader).
2. Drop any existing non-SELECT policies on the table for `authenticated` (defensive) and re-`CREATE POLICY` the single SELECT policy shown above.
3. `REVOKE EXECUTE ON FUNCTION public.generate_statistical_targets_month(uuid,int,int,uuid[],text) FROM PUBLIC, anon;`
4. `GRANT EXECUTE ON FUNCTION public.generate_statistical_targets_month(uuid,int,int,uuid[],text) TO authenticated, service_role;`

## Client — hook

- `src/hooks/useStatisticalRevenueTargets.ts`
  - `SELECT` from `revenue_statistical_targets_daily` scoped by `tenant_id` and `(year, month)`.
  - `generate({ year, month, venueIds })` → `supabase.rpc('generate_statistical_targets_month', { p_tenant_id, p_year, p_month, p_venue_ids, p_model_version: 'same_weekday_median_12w_v1' })`.
  - Never accepts amounts from the caller. Handles `ok:false` (insufficient history) and `ok:true` (refresh local state).

## Client — type change

- `RevenueTarget.targetAmount: number | null`; `fromDb` returns `null` when column is null; consumers guarded.

## UI (scoped to existing forecast components)

- `RevenueTargetPanel.tsx` — "Generate Statistical Target" (→ "Regenerate…") using the panel's Responsible Venues; confirm dialog with model + lookback window; insufficient-history dialog.
- `ThreeWaySummary.tsx` — Statistical card shows amount, model, generated-at, venues-covered chip; Manager card handles `null`.
- `ThreeWayChart.tsx` — dashed Statistical cumulative series from `revenue_statistical_targets_daily`, filtered by page analytical chips.
- `VenueBreakdownTable.tsx` — Statistical column = sum of daily rows for that venue/month; "—" when none.
- `ForecastInput.tsx` — wires the hook + dailyRows + venueTotals down. No route/layout/sidebar changes.

## Not touched

Manager Target math, Preview → Distribute → Apply, `forecasts`, `sales_records`, Actual aggregation, approvals, `ForecastCharts`, `ForecastTableView`, New Forecast Entry, Revenue Overview, Daily Sales, Reconciliation, sidebar, routes.

## Known limitation (documented, not fixed here)

`sales_records` still stores venue names (not `venue_id`). A rename in Admin will report as insufficient history for the affected months until a future `venue_id` migration on `sales_records`. `cascade_venue_rename` already updates future `sales_records.venue` on rename, so post-rename history remains matchable.

## Verification

1. `tsgo` + Vite production build (harness).
2. **Security test** (new — via `supabase--read_query` acting as a normal tenant member, i.e. not admin/manager, not super_admin):
   - `INSERT INTO revenue_statistical_targets_daily (...)` → must fail (permission denied / RLS).
   - `UPDATE revenue_statistical_targets_daily SET statistical_target_amount = 0` → must fail.
   - `DELETE FROM revenue_statistical_targets_daily` → must fail.
   - `SELECT * FROM revenue_statistical_targets_daily WHERE tenant_id = <own tenant>` → succeeds (rows visible).
   - `SELECT generate_statistical_targets_month(<own tenant>, y, m, ARRAY[venue_id], 'same_weekday_median_12w_v1')` → must fail with `Not authorized: manager or admin role required`.
3. **Positive test** as a Manager/Admin member: same RPC call succeeds; on sufficient history the row count = `daysInMonth × |venue_ids|` and `revenue_targets.statistical_target_amount = SUM(daily)`; on insufficient history nothing is written and prior statistical values are preserved.
4. Playwright screenshot of `/forecast/:venue` showing the populated three-way summary, chart, and table.

## Files

- Migration: 1 new (revoke/regrant + policy tidy). Prior two migrations already applied.
- Created: `src/hooks/useStatisticalRevenueTargets.ts`.
- Changed: `src/components/forecast/RevenueTargetPanel.tsx`, `ThreeWaySummary.tsx`, `ThreeWayChart.tsx`, `VenueBreakdownTable.tsx`, `src/pages/ForecastInput.tsx`, `src/hooks/useRevenueTargets.ts`.
