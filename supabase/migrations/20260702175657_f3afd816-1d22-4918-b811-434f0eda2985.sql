ALTER TABLE public.revenue_targets
  ADD COLUMN IF NOT EXISTS statistical_target_amount numeric,
  ADD COLUMN IF NOT EXISTS statistical_model text,
  ADD COLUMN IF NOT EXISTS statistical_generated_at timestamptz;