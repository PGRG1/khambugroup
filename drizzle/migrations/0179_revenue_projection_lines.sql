-- Revenue targets by line: each venue-day can hold Lunch / Dinner (service periods), Delivery and events.
-- Additive and backward compatible: existing rows become whole-day lines ('day') and the old
-- (tenant_id, venue_id, target_date) unique key stays until the app writes by line_key
-- (a later migration drops it).

ALTER TABLE public.revenue_daily_projections
  ADD COLUMN IF NOT EXISTS line_kind text NOT NULL DEFAULT 'day',
  ADD COLUMN IF NOT EXISTS service_period_id uuid REFERENCES public.venue_service_periods(id),
  ADD COLUMN IF NOT EXISTS label text;

ALTER TABLE public.revenue_daily_projections
  DROP CONSTRAINT IF EXISTS rdp_line_kind_check,
  ADD CONSTRAINT rdp_line_kind_check CHECK (line_kind IN ('day', 'period', 'delivery', 'event')),
  DROP CONSTRAINT IF EXISTS rdp_line_period_check,
  -- A period line needs its period; whole-day and delivery lines never have one; an event may sit in a period.
  ADD CONSTRAINT rdp_line_period_check CHECK (
    (line_kind = 'period' AND service_period_id IS NOT NULL)
    OR (line_kind IN ('day', 'delivery') AND service_period_id IS NULL)
    OR line_kind = 'event'
  ),
  DROP CONSTRAINT IF EXISTS rdp_label_check,
  -- Short label ("Buyout", "Smith wedding"); events must be named.
  ADD CONSTRAINT rdp_label_check CHECK (
    (label IS NULL OR char_length(btrim(label)) BETWEEN 1 AND 60)
    AND (line_kind <> 'event' OR label IS NOT NULL)
  );

-- One row per line: day / delivery once per venue-day, a period once, events once per name.
ALTER TABLE public.revenue_daily_projections
  ADD COLUMN IF NOT EXISTS line_key text GENERATED ALWAYS AS (
    line_kind || ':' || COALESCE(service_period_id::text, '')
    || CASE WHEN line_kind = 'event' THEN ':' || lower(btrim(label)) ELSE '' END
  ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS rdp_line_unique
  ON public.revenue_daily_projections (tenant_id, venue_id, target_date, line_key);

-- Tenant isolation: the venue and the service period must belong to the row's tenant (and the period to the venue).
CREATE OR REPLACE FUNCTION public.rdp_check_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.venues v WHERE v.id = NEW.venue_id AND v.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Venue does not belong to this tenant' USING ERRCODE = '42501';
  END IF;
  IF NEW.service_period_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.venue_service_periods p
    WHERE p.id = NEW.service_period_id AND p.tenant_id = NEW.tenant_id AND p.venue_id = NEW.venue_id
  ) THEN
    RAISE EXCEPTION 'Service period does not belong to this venue' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rdp_check_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_rdp_check_scope ON public.revenue_daily_projections;
CREATE TRIGGER trg_rdp_check_scope BEFORE INSERT OR UPDATE ON public.revenue_daily_projections
  FOR EACH ROW EXECUTE FUNCTION public.rdp_check_scope();
