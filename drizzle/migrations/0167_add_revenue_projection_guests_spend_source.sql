ALTER TABLE public.revenue_daily_projections
  ADD COLUMN IF NOT EXISTS projected_guests integer,
  ADD COLUMN IF NOT EXISTS projected_spend numeric(12,2),
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manager';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'revenue_daily_projections_source_check') THEN
    ALTER TABLE public.revenue_daily_projections
      ADD CONSTRAINT revenue_daily_projections_source_check CHECK (source IN ('manager', 'bani'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'revenue_daily_projections_guests_check') THEN
    ALTER TABLE public.revenue_daily_projections
      ADD CONSTRAINT revenue_daily_projections_guests_check CHECK (projected_guests IS NULL OR projected_guests >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'revenue_daily_projections_spend_check') THEN
    ALTER TABLE public.revenue_daily_projections
      ADD CONSTRAINT revenue_daily_projections_spend_check CHECK (projected_spend IS NULL OR projected_spend >= 0);
  END IF;
END $$;