-- Revenue targets by line, step 2: a venue-day now holds several lines, so the old one-row-per-day
-- key goes. rdp_line_unique (tenant_id, venue_id, target_date, line_key) keeps one row per line.
-- Apply together with publishing the app that writes by line_key.
ALTER TABLE public.revenue_daily_projections DROP CONSTRAINT IF EXISTS rdp_unique;
