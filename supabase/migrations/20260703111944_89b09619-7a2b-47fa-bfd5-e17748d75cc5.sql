
-- =========================================================================
-- 1) venue_service_periods
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.venue_service_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  start_time time NOT NULL,
  end_time time NOT NULL,
  crosses_midnight boolean NOT NULL DEFAULT false,
  applicable_weekdays smallint[] NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT vsp_effective_range CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT vsp_weekdays_valid CHECK (
    applicable_weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
    AND array_length(applicable_weekdays,1) > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS vsp_unique_name_per_venue_effective
  ON public.venue_service_periods (venue_id, name, effective_from, COALESCE(effective_to, '9999-12-31'::date));

CREATE INDEX IF NOT EXISTS vsp_tenant_venue_active_idx
  ON public.venue_service_periods (tenant_id, venue_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_service_periods TO authenticated;
GRANT ALL ON public.venue_service_periods TO service_role;
ALTER TABLE public.venue_service_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY vsp_select ON public.venue_service_periods FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY vsp_write ON public.venue_service_periods FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(tenant_id, auth.uid())
    OR (public.is_tenant_member(tenant_id, auth.uid())
        AND (public.has_role(auth.uid(),'admin'::public.app_role)
             OR public.has_role(auth.uid(),'manager'::public.app_role)))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(tenant_id, auth.uid())
    OR (public.is_tenant_member(tenant_id, auth.uid())
        AND (public.has_role(auth.uid(),'admin'::public.app_role)
             OR public.has_role(auth.uid(),'manager'::public.app_role)))
  );

CREATE OR REPLACE FUNCTION public.vsp_set_crosses_midnight()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.crosses_midnight := (NEW.end_time <= NEW.start_time);
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vsp_crosses_midnight ON public.venue_service_periods;
CREATE TRIGGER trg_vsp_crosses_midnight
  BEFORE INSERT OR UPDATE ON public.venue_service_periods
  FOR EACH ROW EXECUTE FUNCTION public.vsp_set_crosses_midnight();

-- Seed "Full Day" for active venues without any service periods
INSERT INTO public.venue_service_periods (tenant_id, venue_id, name, code, start_time, end_time, applicable_weekdays, sort_order)
SELECT v.tenant_id, v.id, 'Full Day', 'full_day', '00:00'::time, '23:59:59'::time,
       ARRAY[0,1,2,3,4,5,6]::smallint[], 0
  FROM public.venues v
 WHERE v.is_active = true
   AND NOT EXISTS (SELECT 1 FROM public.venue_service_periods p WHERE p.venue_id = v.id);

-- =========================================================================
-- 2) revenue_target_days
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.revenue_target_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  target_date date NOT NULL,
  operating_status text NOT NULL DEFAULT 'normal',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT rtd_status_check CHECK (operating_status IN ('normal','mixed','events_only','closed')),
  CONSTRAINT rtd_unique UNIQUE (tenant_id, venue_id, target_date)
);

CREATE INDEX IF NOT EXISTS rtd_tenant_month_idx
  ON public.revenue_target_days (tenant_id, target_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenue_target_days TO authenticated;
GRANT ALL ON public.revenue_target_days TO service_role;
ALTER TABLE public.revenue_target_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY rtd_select ON public.revenue_target_days FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY rtd_write ON public.revenue_target_days FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(tenant_id, auth.uid())
    OR (public.is_tenant_member(tenant_id, auth.uid())
        AND (public.has_role(auth.uid(),'admin'::public.app_role)
             OR public.has_role(auth.uid(),'manager'::public.app_role)))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(tenant_id, auth.uid())
    OR (public.is_tenant_member(tenant_id, auth.uid())
        AND (public.has_role(auth.uid(),'admin'::public.app_role)
             OR public.has_role(auth.uid(),'manager'::public.app_role)))
  );

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_rtd_touch ON public.revenue_target_days;
CREATE TRIGGER trg_rtd_touch BEFORE UPDATE ON public.revenue_target_days
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- 3) revenue_manager_target_lines
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.revenue_manager_target_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  target_date date NOT NULL,
  line_type text NOT NULL,
  service_period_id uuid REFERENCES public.venue_service_periods(id) ON DELETE RESTRICT,
  event_name text,
  event_type text,
  event_mode text,
  replaces_service_period_id uuid REFERENCES public.venue_service_periods(id) ON DELETE SET NULL,
  venue_area text,
  event_start_time time,
  event_end_time time,
  target_input_mode text NOT NULL DEFAULT 'drivers',
  manager_guest_target numeric,
  manager_spend_per_guest_target numeric,
  manager_revenue_override numeric,
  line_status text NOT NULL DEFAULT 'operating',
  zero_reason text,
  notes text,
  manager_source text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,

  manager_revenue_target numeric GENERATED ALWAYS AS (
    CASE
      WHEN line_status IN ('not_operating','replaced_by_event','closed') THEN 0
      WHEN target_input_mode = 'contracted_revenue' THEN round(COALESCE(manager_revenue_override,0)::numeric, 2)
      WHEN manager_guest_target IS NULL OR manager_spend_per_guest_target IS NULL THEN NULL
      ELSE round((manager_guest_target * manager_spend_per_guest_target)::numeric, 2)
    END
  ) STORED,

  CONSTRAINT rmtl_line_type_check CHECK (line_type IN ('service_period','event')),
  CONSTRAINT rmtl_input_mode_check CHECK (target_input_mode IN ('drivers','contracted_revenue')),
  CONSTRAINT rmtl_line_status_check CHECK (line_status IN ('operating','not_operating','replaced_by_event','closed')),
  CONSTRAINT rmtl_status_check CHECK (status IN ('draft','saved','approved')),
  CONSTRAINT rmtl_event_mode_check CHECK (
    event_mode IS NULL OR event_mode IN ('additive','replaces_period','events_only','partial_replacement')
  ),
  CONSTRAINT rmtl_service_period_shape CHECK (
    line_type <> 'service_period' OR (
      service_period_id IS NOT NULL AND event_name IS NULL AND event_mode IS NULL
    )
  ),
  CONSTRAINT rmtl_event_shape CHECK (
    line_type <> 'event' OR (
      event_name IS NOT NULL AND event_mode IS NOT NULL AND service_period_id IS NULL
    )
  ),
  CONSTRAINT rmtl_replaces_shape CHECK (
    event_mode IS DISTINCT FROM 'replaces_period' OR replaces_service_period_id IS NOT NULL
  ),
  CONSTRAINT rmtl_drivers_present CHECK (
    line_status <> 'operating'
    OR target_input_mode <> 'drivers'
    OR (manager_guest_target IS NOT NULL AND manager_spend_per_guest_target IS NOT NULL)
  ),
  CONSTRAINT rmtl_contracted_present CHECK (
    line_status <> 'operating'
    OR target_input_mode <> 'contracted_revenue'
    OR manager_revenue_override IS NOT NULL
  ),
  CONSTRAINT rmtl_zero_reason_when_not_operating CHECK (
    line_status = 'operating' OR zero_reason IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS rmtl_tenant_month_idx
  ON public.revenue_manager_target_lines (tenant_id, target_date);
CREATE INDEX IF NOT EXISTS rmtl_venue_date_idx
  ON public.revenue_manager_target_lines (venue_id, target_date);

CREATE UNIQUE INDEX IF NOT EXISTS rmtl_unique_service_period_row
  ON public.revenue_manager_target_lines (tenant_id, venue_id, target_date, service_period_id)
  WHERE line_type = 'service_period';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenue_manager_target_lines TO authenticated;
GRANT ALL ON public.revenue_manager_target_lines TO service_role;
ALTER TABLE public.revenue_manager_target_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY rmtl_select ON public.revenue_manager_target_lines FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY rmtl_write ON public.revenue_manager_target_lines FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(tenant_id, auth.uid())
    OR (public.is_tenant_member(tenant_id, auth.uid())
        AND (public.has_role(auth.uid(),'admin'::public.app_role)
             OR public.has_role(auth.uid(),'manager'::public.app_role)))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(tenant_id, auth.uid())
    OR (public.is_tenant_member(tenant_id, auth.uid())
        AND (public.has_role(auth.uid(),'admin'::public.app_role)
             OR public.has_role(auth.uid(),'manager'::public.app_role)))
  );

DROP TRIGGER IF EXISTS trg_rmtl_touch ON public.revenue_manager_target_lines;
CREATE TRIGGER trg_rmtl_touch BEFORE UPDATE ON public.revenue_manager_target_lines
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================================
-- 4) Extend revenue_statistical_targets_daily
-- =========================================================================
ALTER TABLE public.revenue_statistical_targets_daily
  ADD COLUMN IF NOT EXISTS service_period_id uuid REFERENCES public.venue_service_periods(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS statistical_guest_target numeric,
  ADD COLUMN IF NOT EXISTS statistical_spend_per_guest numeric,
  ADD COLUMN IF NOT EXISTS revenue_observation_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS guest_observation_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_period_name_snapshot text;

-- Relax confidence check to allow 'unavailable' plus 'high'/'low'
ALTER TABLE public.revenue_statistical_targets_daily
  DROP CONSTRAINT IF EXISTS revenue_statistical_targets_daily_confidence_check;
ALTER TABLE public.revenue_statistical_targets_daily
  ADD CONSTRAINT revenue_statistical_targets_daily_confidence_check
  CHECK (confidence IS NULL OR confidence IN ('high','low','unavailable'));

-- Backfill service_period_id from Full Day period per venue
UPDATE public.revenue_statistical_targets_daily d
   SET service_period_id = p.id,
       service_period_name_snapshot = p.name,
       revenue_observation_count = COALESCE(d.revenue_observation_count, d.observation_count)
  FROM public.venue_service_periods p
 WHERE d.service_period_id IS NULL
   AND p.venue_id = d.venue_id
   AND p.name = 'Full Day';

-- Any remaining orphans (venue with no Full Day) — create Full Day then backfill
INSERT INTO public.venue_service_periods (tenant_id, venue_id, name, code, start_time, end_time, applicable_weekdays, sort_order)
SELECT DISTINCT d.tenant_id, d.venue_id, 'Full Day', 'full_day', '00:00'::time, '23:59:59'::time,
       ARRAY[0,1,2,3,4,5,6]::smallint[], 0
  FROM public.revenue_statistical_targets_daily d
 WHERE d.service_period_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.venue_service_periods p WHERE p.venue_id = d.venue_id AND p.name='Full Day');

UPDATE public.revenue_statistical_targets_daily d
   SET service_period_id = p.id,
       service_period_name_snapshot = p.name
  FROM public.venue_service_periods p
 WHERE d.service_period_id IS NULL
   AND p.venue_id = d.venue_id
   AND p.name = 'Full Day';

ALTER TABLE public.revenue_statistical_targets_daily
  ALTER COLUMN service_period_id SET NOT NULL;

ALTER TABLE public.revenue_statistical_targets_daily
  DROP CONSTRAINT IF EXISTS revenue_stat_targets_daily_unique;
ALTER TABLE public.revenue_statistical_targets_daily
  ADD CONSTRAINT revenue_stat_targets_daily_unique
  UNIQUE (tenant_id, venue_id, service_period_id, target_date);

-- =========================================================================
-- 5) RPC: generate_revenue_statistical_targets_month_v2
-- =========================================================================
CREATE OR REPLACE FUNCTION public.generate_revenue_statistical_targets_month_v2(
  p_tenant_id uuid,
  p_year integer,
  p_month integer,
  p_venue_ids uuid[],
  p_model_version text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_month_start date;
  v_month_end date;
  v_lookback_start date;
  v_lookback_end date;
  v_inserted integer := 0;
  v_monthly_total numeric := 0;
  v_venue_totals jsonb := '{}'::jsonb;
  r record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.is_super_admin(v_uid) OR public.is_tenant_member(p_tenant_id, v_uid)) THEN
    RAISE EXCEPTION 'Not authorized for tenant';
  END IF;
  IF NOT (public.is_super_admin(v_uid)
          OR public.has_role(v_uid,'admin'::public.app_role)
          OR public.has_role(v_uid,'manager'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized: manager or admin role required';
  END IF;
  IF p_year < 2000 OR p_year > 2100 OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Invalid year/month';
  END IF;
  IF p_venue_ids IS NULL OR array_length(p_venue_ids,1) IS NULL THEN
    RAISE EXCEPTION 'venue_ids required';
  END IF;
  IF p_model_version <> 'same_weekday_service_period_median_12w_v1' THEN
    RAISE EXCEPTION 'Unsupported model version';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_venue_ids) vid
     WHERE NOT EXISTS (SELECT 1 FROM public.venues v WHERE v.id = vid AND v.tenant_id = p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'One or more venues do not belong to tenant';
  END IF;

  v_month_start := make_date(p_year, p_month, 1);
  v_month_end   := (v_month_start + INTERVAL '1 month - 1 day')::date;
  v_lookback_end   := v_month_start - 1;
  v_lookback_start := v_lookback_end - (12*7 - 1);

  -- Historical daily totals from sales_records (Full-Day only for now; see notes)
  CREATE TEMP TABLE tmp_hist ON COMMIT DROP AS
  SELECT sr.venue_id,
         sr.date::date AS business_date,
         EXTRACT(DOW FROM sr.date::date)::int AS weekday,
         SUM(COALESCE(sr.total_sales,0))::numeric AS revenue,
         SUM(COALESCE(sr.guests,0))::numeric AS guests
    FROM public.sales_records sr
   WHERE sr.tenant_id = p_tenant_id
     AND sr.venue_id = ANY(p_venue_ids)
     AND sr.date::date BETWEEN v_lookback_start AND v_lookback_end
   GROUP BY sr.venue_id, sr.date::date;

  -- Stage: one row per (venue, date, active service period) for the target month
  CREATE TEMP TABLE tmp_stage ON COMMIT DROP AS
  SELECT p_tenant_id AS tenant_id,
         v.id  AS venue_id,
         v.name AS venue_name,
         sp.id AS service_period_id,
         sp.name AS service_period_name,
         d::date AS target_date,
         EXTRACT(DOW FROM d)::int AS weekday
    FROM public.venues v
    JOIN public.venue_service_periods sp ON sp.venue_id = v.id AND sp.is_active = true
    CROSS JOIN LATERAL generate_series(v_month_start, v_month_end, INTERVAL '1 day') AS d
   WHERE v.id = ANY(p_venue_ids)
     AND sp.effective_from <= d::date
     AND (sp.effective_to IS NULL OR sp.effective_to >= d::date)
     AND EXTRACT(DOW FROM d)::smallint = ANY(sp.applicable_weekdays);

  -- Delete existing statistical rows in scope (atomic replace)
  DELETE FROM public.revenue_statistical_targets_daily d
   USING tmp_stage s
   WHERE d.tenant_id = s.tenant_id
     AND d.venue_id = s.venue_id
     AND d.service_period_id = s.service_period_id
     AND d.target_date = s.target_date;

  -- Insert one row per stage row using same-weekday medians (Full-Day approximation)
  INSERT INTO public.revenue_statistical_targets_daily (
    tenant_id, venue_id, venue_name_snapshot, service_period_id, service_period_name_snapshot,
    target_date, statistical_target_amount, statistical_guest_target, statistical_spend_per_guest,
    model, model_version, lookback_start, lookback_end,
    observation_count, revenue_observation_count, guest_observation_count,
    confidence, generated_by
  )
  SELECT s.tenant_id, s.venue_id, s.venue_name, s.service_period_id, s.service_period_name,
         s.target_date,
         COALESCE(round(agg.rev_median::numeric, 2), 0),
         agg.guest_median,
         CASE
           WHEN agg.guest_median IS NULL OR agg.guest_median = 0 THEN NULL
           ELSE round((agg.rev_median / agg.guest_median)::numeric, 2)
         END,
         'Same Weekday + Service Period Median — 12 Weeks',
         'same_weekday_service_period_median_12w_v1',
         v_lookback_start, v_lookback_end,
         COALESCE(agg.n,0), COALESCE(agg.n,0), COALESCE(agg.n_guests,0),
         CASE
           WHEN COALESCE(agg.n,0) = 0 THEN 'unavailable'
           WHEN COALESCE(agg.n,0) >= 4 THEN 'high'
           ELSE 'low'
         END,
         v_uid
    FROM tmp_stage s
    LEFT JOIN LATERAL (
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY h.revenue) AS rev_median,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY NULLIF(h.guests,0)) AS guest_median,
             COUNT(*) AS n,
             COUNT(NULLIF(h.guests,0)) AS n_guests
        FROM tmp_hist h
       WHERE h.venue_id = s.venue_id
         AND h.weekday = s.weekday
    ) agg ON true;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT COALESCE(SUM(statistical_target_amount),0)
    INTO v_monthly_total
    FROM public.revenue_statistical_targets_daily
   WHERE tenant_id = p_tenant_id
     AND venue_id = ANY(p_venue_ids)
     AND target_date BETWEEN v_month_start AND v_month_end;

  SELECT COALESCE(jsonb_object_agg(venue_id::text, total), '{}'::jsonb)
    INTO v_venue_totals
    FROM (
      SELECT venue_id, SUM(statistical_target_amount) AS total
        FROM public.revenue_statistical_targets_daily
       WHERE tenant_id = p_tenant_id
         AND venue_id = ANY(p_venue_ids)
         AND target_date BETWEEN v_month_start AND v_month_end
       GROUP BY venue_id
    ) t;

  -- Patch or insert revenue_targets summary row (legacy compat)
  FOR r IN
    SELECT venue_id, SUM(statistical_target_amount) AS total
      FROM public.revenue_statistical_targets_daily
     WHERE tenant_id = p_tenant_id
       AND venue_id = ANY(p_venue_ids)
       AND target_date BETWEEN v_month_start AND v_month_end
     GROUP BY venue_id
  LOOP
    IF EXISTS (SELECT 1 FROM public.revenue_targets WHERE tenant_id=p_tenant_id AND year=p_year AND month=p_month) THEN
      UPDATE public.revenue_targets
         SET statistical_target_amount = (
               SELECT COALESCE(SUM(statistical_target_amount),0)
                 FROM public.revenue_statistical_targets_daily
                WHERE tenant_id=p_tenant_id AND venue_id = ANY(p_venue_ids)
                  AND target_date BETWEEN v_month_start AND v_month_end
             ),
             statistical_model = 'Same Weekday + Service Period Median — 12 Weeks',
             statistical_generated_at = now()
       WHERE tenant_id=p_tenant_id AND year=p_year AND month=p_month;
      EXIT;
    ELSE
      INSERT INTO public.revenue_targets (tenant_id, year, month, target_amount, venues, notes, created_by,
                                          statistical_target_amount, statistical_model, statistical_generated_at)
      VALUES (p_tenant_id, p_year, p_month, NULL, ARRAY[]::text[], '', v_uid,
              v_monthly_total, 'Same Weekday + Service Period Median — 12 Weeks', now());
      EXIT;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'monthly_total', v_monthly_total,
    'venue_totals', v_venue_totals,
    'model', 'Same Weekday + Service Period Median — 12 Weeks',
    'model_version', 'same_weekday_service_period_median_12w_v1'
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.generate_revenue_statistical_targets_month_v2(uuid,int,int,uuid[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_revenue_statistical_targets_month_v2(uuid,int,int,uuid[],text) TO authenticated, service_role;

-- =========================================================================
-- 6) RPC: ensure_revenue_manager_target_lines_month
-- =========================================================================
CREATE OR REPLACE FUNCTION public.ensure_revenue_manager_target_lines_month(
  p_tenant_id uuid,
  p_year integer,
  p_month integer,
  p_venue_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_month_start date;
  v_month_end date;
  v_inserted integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.is_super_admin(v_uid) OR public.is_tenant_member(p_tenant_id, v_uid)) THEN
    RAISE EXCEPTION 'Not authorized for tenant';
  END IF;
  IF NOT (public.is_super_admin(v_uid)
          OR public.has_role(v_uid,'admin'::public.app_role)
          OR public.has_role(v_uid,'manager'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized: manager or admin role required';
  END IF;
  IF p_year < 2000 OR p_year > 2100 OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Invalid year/month';
  END IF;
  IF p_venue_ids IS NULL OR array_length(p_venue_ids,1) IS NULL THEN
    RAISE EXCEPTION 'venue_ids required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_venue_ids) vid
     WHERE NOT EXISTS (SELECT 1 FROM public.venues v WHERE v.id = vid AND v.tenant_id = p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'One or more venues do not belong to tenant';
  END IF;

  v_month_start := make_date(p_year, p_month, 1);
  v_month_end   := (v_month_start + INTERVAL '1 month - 1 day')::date;

  WITH stage AS (
    SELECT p_tenant_id AS tenant_id,
           v.id AS venue_id,
           sp.id AS service_period_id,
           d::date AS target_date
      FROM public.venues v
      JOIN public.venue_service_periods sp ON sp.venue_id = v.id AND sp.is_active = true
      CROSS JOIN LATERAL generate_series(v_month_start, v_month_end, INTERVAL '1 day') AS d
     WHERE v.id = ANY(p_venue_ids)
       AND sp.effective_from <= d::date
       AND (sp.effective_to IS NULL OR sp.effective_to >= d::date)
       AND EXTRACT(DOW FROM d)::smallint = ANY(sp.applicable_weekdays)
  ), ins AS (
    INSERT INTO public.revenue_manager_target_lines (
      tenant_id, venue_id, target_date, line_type, service_period_id,
      target_input_mode, manager_guest_target, manager_spend_per_guest_target,
      manager_source, status, created_by, updated_by
    )
    SELECT s.tenant_id, s.venue_id, s.target_date, 'service_period', s.service_period_id,
           'drivers',
           st.statistical_guest_target,
           st.statistical_spend_per_guest,
           CASE WHEN st.id IS NULL THEN NULL ELSE 'statistical_default' END,
           'draft', v_uid, v_uid
      FROM stage s
      LEFT JOIN public.revenue_statistical_targets_daily st
        ON st.tenant_id = s.tenant_id
       AND st.venue_id = s.venue_id
       AND st.service_period_id = s.service_period_id
       AND st.target_date = s.target_date
     WHERE NOT EXISTS (
       SELECT 1 FROM public.revenue_manager_target_lines m
        WHERE m.tenant_id = s.tenant_id
          AND m.venue_id = s.venue_id
          AND m.target_date = s.target_date
          AND m.line_type = 'service_period'
          AND m.service_period_id = s.service_period_id
     )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted);
END $$;

REVOKE EXECUTE ON FUNCTION public.ensure_revenue_manager_target_lines_month(uuid,int,int,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_revenue_manager_target_lines_month(uuid,int,int,uuid[]) TO authenticated, service_role;
