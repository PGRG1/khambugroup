
-- Allow draft manager target rows to have blank drivers / no contracted revenue.
-- Saved/approved rows still require the full set.
ALTER TABLE public.revenue_manager_target_lines
  DROP CONSTRAINT IF EXISTS rmtl_drivers_present;
ALTER TABLE public.revenue_manager_target_lines
  ADD CONSTRAINT rmtl_drivers_present CHECK (
    status = 'draft'
    OR line_status <> 'operating'
    OR target_input_mode <> 'drivers'
    OR (manager_guest_target IS NOT NULL AND manager_spend_per_guest_target IS NOT NULL)
  );

ALTER TABLE public.revenue_manager_target_lines
  DROP CONSTRAINT IF EXISTS rmtl_contracted_present;
ALTER TABLE public.revenue_manager_target_lines
  ADD CONSTRAINT rmtl_contracted_present CHECK (
    status = 'draft'
    OR line_status <> 'operating'
    OR target_input_mode <> 'contracted_revenue'
    OR manager_revenue_override IS NOT NULL
  );
