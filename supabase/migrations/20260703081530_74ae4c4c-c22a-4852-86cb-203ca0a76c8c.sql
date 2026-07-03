
-- Drop previous client-driven RPC.
DROP FUNCTION IF EXISTS public.replace_statistical_targets_month(
  uuid, integer, integer, uuid[], text[], text, text, jsonb
);

-- New server-authoritative RPC. Client sends only tenant, year, month, venue_ids,
-- model_version. Everything else — including the computed amount and generated_by
-- — is derived server-side.
CREATE OR REPLACE FUNCTION public.generate_statistical_targets_month(
  p_tenant_id uuid,
  p_year integer,
  p_month integer,
  p_venue_ids uuid[],
  p_model_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_model_name constant text := 'Same Weekday Median — 12 Weeks';
  v_lookback_weeks constant integer := 12;
  v_month_start date;
  v_month_end date;
  v_lookback_end date;
  v_lookback_start date;
  v_bad_venue_count integer;
  v_missing jsonb;
  v_inserted integer := 0;
  v_monthly_total numeric := 0;
  v_venue_totals jsonb;
BEGIN
  -- --- Auth & input validation -------------------------------------------------
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;
  IF NOT (public.is_super_admin(v_uid) OR public.user_has_tenant(v_uid, p_tenant_id)) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;
  -- Permission: manager or admin role only. Tenant membership alone is not enough.
  IF NOT (public.is_super_admin(v_uid)
          OR public.has_role(v_uid, 'admin'::public.app_role)
          OR public.has_role(v_uid, 'manager'::public.app_role)) THEN
    RAISE EXCEPTION 'Manager or admin role required to generate statistical targets';
  END IF;
  IF p_year IS NULL OR p_month IS NULL OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Invalid year/month';
  END IF;
  IF p_venue_ids IS NULL OR array_length(p_venue_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one venue is required';
  END IF;
  IF p_model_version IS NULL OR p_model_version NOT IN ('same_weekday_median_12w_v1') THEN
    RAISE EXCEPTION 'Unsupported model_version: %', p_model_version;
  END IF;

  -- Every venue must belong to the tenant.
  SELECT COUNT(*) INTO v_bad_venue_count
    FROM unnest(p_venue_ids) AS vid
   WHERE NOT EXISTS (
      SELECT 1 FROM public.venues v
       WHERE v.id = vid AND v.tenant_id = p_tenant_id
    );
  IF v_bad_venue_count > 0 THEN
    RAISE EXCEPTION 'One or more venues do not belong to this tenant';
  END IF;

  v_month_start   := make_date(p_year, p_month, 1);
  v_month_end     := (v_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
  v_lookback_end  := v_month_start - INTERVAL '1 day';
  v_lookback_start := v_lookback_end - (v_lookback_weeks * 7 - 1);

  -- --- Compute in TEMP staging so nothing lands in the real table unless
  --     history is sufficient. -------------------------------------------------
  CREATE TEMP TABLE _stat_daily_stage (
    venue_id uuid NOT NULL,
    venue_name_snapshot text NOT NULL,
    target_date date NOT NULL,
    amount numeric NOT NULL,
    observation_count integer NOT NULL,
    confidence text NOT NULL
  ) ON COMMIT DROP;

  WITH scope_venues AS (
    SELECT v.id AS venue_id, v.name AS venue_name
      FROM public.venues v
     WHERE v.tenant_id = p_tenant_id
       AND v.id = ANY (p_venue_ids)
  ),
  -- One observation per (venue, business date) — matches memory rule that Total
  -- Sales already includes service charge + discount adjustment.
  daily_actual AS (
    SELECT sv.venue_id,
           sv.venue_name,
           s.date::date AS business_date,
           SUM(COALESCE(s.total_sales, 0))::numeric AS daily_total
      FROM scope_venues sv
      JOIN public.sales_records s
        ON s.tenant_id = p_tenant_id
       AND lower(trim(s.venue)) = lower(trim(sv.venue_name))
       AND s.date::date BETWEEN v_lookback_start AND v_lookback_end
     GROUP BY sv.venue_id, sv.venue_name, s.date::date
  ),
  weekday_medians AS (
    SELECT venue_id,
           venue_name,
           EXTRACT(DOW FROM business_date)::int AS weekday,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY daily_total) AS median_total,
           COUNT(*)::int AS obs_count
      FROM daily_actual
     GROUP BY venue_id, venue_name, EXTRACT(DOW FROM business_date)
  ),
  target_days AS (
    SELECT sv.venue_id,
           sv.venue_name,
           gs::date AS target_date,
           EXTRACT(DOW FROM gs)::int AS weekday
      FROM scope_venues sv
     CROSS JOIN generate_series(v_month_start::timestamp,
                                v_month_end::timestamp,
                                INTERVAL '1 day') AS gs
  )
  INSERT INTO _stat_daily_stage (
    venue_id, venue_name_snapshot, target_date, amount, observation_count, confidence
  )
  SELECT td.venue_id,
         td.venue_name,
         td.target_date,
         ROUND(wm.median_total, 0),
         wm.obs_count,
         CASE WHEN wm.obs_count >= 4 THEN 'high' ELSE 'low' END
    FROM target_days td
    LEFT JOIN weekday_medians wm
      ON wm.venue_id = td.venue_id AND wm.weekday = td.weekday;

  -- Insufficient history = any target day whose (venue, weekday) has no obs.
  SELECT jsonb_agg(
           jsonb_build_object(
             'venue_id', s.venue_id,
             'venue_name', s.venue_name_snapshot,
             'weekday', EXTRACT(DOW FROM s.target_date)::int
           )
         )
    INTO v_missing
    FROM (
      SELECT DISTINCT venue_id, venue_name_snapshot, EXTRACT(DOW FROM target_date)::int AS wd
        FROM _stat_daily_stage
       WHERE observation_count IS NULL OR observation_count = 0 OR amount IS NULL
    ) AS s
    -- alias the columns back for the outer jsonb_agg
    CROSS JOIN LATERAL (SELECT s.wd AS target_date) x;

  IF v_missing IS NOT NULL AND jsonb_array_length(v_missing) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_history',
      'missing', v_missing,
      'lookback_start', v_lookback_start,
      'lookback_end', v_lookback_end
    );
  END IF;

  -- --- Atomic replace of the scope for this month ------------------------------
  DELETE FROM public.revenue_statistical_targets_daily d
   WHERE d.tenant_id = p_tenant_id
     AND d.venue_id = ANY (p_venue_ids)
     AND d.target_date BETWEEN v_month_start AND v_month_end;

  INSERT INTO public.revenue_statistical_targets_daily (
    tenant_id, venue_id, venue_name_snapshot, target_date,
    statistical_target_amount, model, model_version,
    lookback_start, lookback_end, observation_count, confidence,
    generated_at, generated_by
  )
  SELECT p_tenant_id,
         s.venue_id,
         s.venue_name_snapshot,
         s.target_date,
         s.amount,
         v_model_name,
         p_model_version,
         v_lookback_start,
         v_lookback_end,
         s.observation_count,
         s.confidence,
         now(),
         v_uid          -- generated_by is auth.uid(), never client-supplied
    FROM _stat_daily_stage s;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Monthly total from the table (union of new scope with anything preserved
  -- outside of it).
  SELECT COALESCE(SUM(statistical_target_amount), 0)
    INTO v_monthly_total
    FROM public.revenue_statistical_targets_daily
   WHERE tenant_id = p_tenant_id
     AND target_date BETWEEN v_month_start AND v_month_end;

  SELECT jsonb_object_agg(venue_id::text, venue_sum)
    INTO v_venue_totals
    FROM (
      SELECT venue_id, SUM(statistical_target_amount) AS venue_sum
        FROM public.revenue_statistical_targets_daily
       WHERE tenant_id = p_tenant_id
         AND target_date BETWEEN v_month_start AND v_month_end
       GROUP BY venue_id
    ) t;

  -- Update or insert the monthly revenue_targets row. Never touch Manager fields
  -- (target_amount / venues / notes / created_by) when a row already exists.
  IF EXISTS (
    SELECT 1 FROM public.revenue_targets
     WHERE tenant_id = p_tenant_id AND year = p_year AND month = p_month
  ) THEN
    UPDATE public.revenue_targets
       SET statistical_target_amount = v_monthly_total,
           statistical_model = v_model_name,
           statistical_generated_at = now()
     WHERE tenant_id = p_tenant_id AND year = p_year AND month = p_month;
  ELSE
    INSERT INTO public.revenue_targets (
      tenant_id, year, month, target_amount, venues, notes, created_by,
      statistical_target_amount, statistical_model, statistical_generated_at
    )
    SELECT p_tenant_id, p_year, p_month, NULL,
           COALESCE(array_agg(DISTINCT v.name ORDER BY v.name), ARRAY[]::text[]),
           '', v_uid,
           v_monthly_total, v_model_name, now()
      FROM public.venues v
     WHERE v.tenant_id = p_tenant_id
       AND v.id = ANY (p_venue_ids);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'monthly_total', v_monthly_total,
    'venue_totals', COALESCE(v_venue_totals, '{}'::jsonb),
    'lookback_start', v_lookback_start,
    'lookback_end', v_lookback_end,
    'model', v_model_name,
    'model_version', p_model_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_statistical_targets_month(uuid, integer, integer, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_statistical_targets_month(uuid, integer, integer, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_statistical_targets_month(uuid, integer, integer, uuid[], text) TO service_role;
