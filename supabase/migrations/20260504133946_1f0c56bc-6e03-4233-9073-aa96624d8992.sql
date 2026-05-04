
ALTER TABLE public.revenue_sources
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
