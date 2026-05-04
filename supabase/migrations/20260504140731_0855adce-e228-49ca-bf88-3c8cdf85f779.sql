ALTER TABLE public.service_periods
  ADD COLUMN IF NOT EXISTS revenue_source_id uuid REFERENCES public.revenue_sources(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_service_periods_revenue_source ON public.service_periods(revenue_source_id);