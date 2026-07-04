
-- Fix Assembly service period pollution left over from the multi-period test.
-- Full Day (id 73a04371...) should be a fully retired inactive period, not
-- squatting on July 2026. Late Operation is the only active operational period.
UPDATE public.venue_service_periods
   SET effective_from = '2000-01-01',
       effective_to   = '2024-12-31',
       is_active      = false
 WHERE id = '73a04371-1621-45f3-83d2-9f9518c886b5';

-- Repoint any Assembly manager target lines from the retired Full Day period
-- to the active Late Operation period so the DailyRegister expanded rows
-- render the correct label and join to actuals.
UPDATE public.revenue_manager_target_lines mtl
   SET service_period_id = 'f4312cbc-e563-4bc2-a0d7-8bee78c88540',
       updated_at = now()
 WHERE mtl.service_period_id = '73a04371-1621-45f3-83d2-9f9518c886b5';

-- Backfill missing Assembly manager target lines for July 1-2, 2026 using the
-- statistical drivers already computed for those days. The seeder RPC skipped
-- these dates because the retired Full Day period had effective_from=2026-07-03
-- during the earlier test.
INSERT INTO public.revenue_manager_target_lines (
  tenant_id, venue_id, target_date, line_type, service_period_id,
  target_input_mode, manager_guest_target, manager_spend_per_guest_target,
  manager_source, status
)
SELECT st.tenant_id, st.venue_id, st.target_date, 'service_period',
       'f4312cbc-e563-4bc2-a0d7-8bee78c88540',
       'drivers',
       st.statistical_guest_target,
       st.statistical_spend_per_guest,
       'statistical_default',
       'draft'
  FROM public.revenue_statistical_targets_daily st
  JOIN public.venues v ON v.id = st.venue_id
 WHERE v.name = 'Assembly'
   AND st.target_date IN ('2026-07-01','2026-07-02')
   AND st.statistical_guest_target IS NOT NULL
   AND st.statistical_spend_per_guest IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.revenue_manager_target_lines m
      WHERE m.tenant_id = st.tenant_id
        AND m.venue_id = st.venue_id
        AND m.target_date = st.target_date
        AND m.line_type = 'service_period'
   );
