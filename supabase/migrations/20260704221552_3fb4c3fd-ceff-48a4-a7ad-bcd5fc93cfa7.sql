
-- Backdate operational periods so they cover historical statistical data.
UPDATE public.venue_service_periods
   SET effective_from = '2020-01-01'
 WHERE id IN (
   'a179cbca-f103-421a-8ee9-147c39085f74',  -- Caliente Late Operation
   '81b6ebe3-ebbe-4761-ba4f-46cd13d431fd',  -- Hanabi Full Day
   '1f608d9a-d5ea-4cf3-81a0-aded32baa4fa'   -- Arca Full Day
 );

-- Backfill Caliente manager target lines for every date with statistical drivers,
-- tagged to Late Operation. Skips dates that already have a line.
INSERT INTO public.revenue_manager_target_lines (
  tenant_id, venue_id, target_date, line_type, service_period_id,
  target_input_mode, manager_guest_target, manager_spend_per_guest_target,
  manager_source, status
)
SELECT st.tenant_id, st.venue_id, st.target_date, 'service_period',
       'a179cbca-f103-421a-8ee9-147c39085f74',
       'drivers',
       st.statistical_guest_target,
       st.statistical_spend_per_guest,
       'statistical_default',
       'draft'
  FROM public.revenue_statistical_targets_daily st
  JOIN public.venues v ON v.id = st.venue_id
 WHERE v.name = 'Caliente'
   AND st.statistical_guest_target IS NOT NULL
   AND st.statistical_spend_per_guest IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.revenue_manager_target_lines m
      WHERE m.tenant_id = st.tenant_id
        AND m.venue_id = st.venue_id
        AND m.target_date = st.target_date
        AND m.line_type = 'service_period'
   );
