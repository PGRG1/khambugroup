
-- 1. Make revenue_targets.target_amount nullable and drop the 0 default so a
--    statistical-only row can be created without a placeholder Manager Target.
ALTER TABLE public.revenue_targets
  ALTER COLUMN target_amount DROP NOT NULL,
  ALTER COLUMN target_amount DROP DEFAULT;

-- 2. Daily statistical target table
CREATE TABLE IF NOT EXISTS public.revenue_statistical_targets_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  venue_name_snapshot text NOT NULL,
  target_date date NOT NULL,
  statistical_target_amount numeric NOT NULL,
  model text NOT NULL,
  model_version text NOT NULL,
  lookback_start date NOT NULL,
  lookback_end date NOT NULL,
  observation_count integer NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('high','low')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT revenue_stat_targets_daily_unique UNIQUE (tenant_id, venue_id, target_date)
);

CREATE INDEX IF NOT EXISTS revenue_stat_targets_daily_tenant_date_idx
  ON public.revenue_statistical_targets_daily (tenant_id, target_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenue_statistical_targets_daily TO authenticated;
GRANT ALL ON public.revenue_statistical_targets_daily TO service_role;

ALTER TABLE public.revenue_statistical_targets_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stat_targets_daily_select_members"
  ON public.revenue_statistical_targets_daily
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "stat_targets_daily_write_members"
  ON public.revenue_statistical_targets_daily
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE TRIGGER trg_revenue_stat_targets_daily_updated
  BEFORE UPDATE ON public.revenue_statistical_targets_daily
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. RPC — atomic replace of a month's generated scope + recompute monthly total.
--
-- p_rows jsonb array. Each item:
--   { "venue_id": uuid, "venue_name": text, "target_date": "YYYY-MM-DD",
--     "amount": numeric, "observation_count": int, "confidence": "high"|"low",
--     "lookback_start": "YYYY-MM-DD", "lookback_end": "YYYY-MM-DD" }
--
-- Server-side validation: tenant membership, venues belong to tenant, target_dates
-- belong to the requested month, model_version is on the approved allow-list.
-- Monthly amount is computed from the rows actually stored after the replace.
CREATE OR REPLACE FUNCTION public.replace_statistical_targets_month(
  p_tenant_id uuid,
  p_year integer,
  p_month integer,
  p_venue_ids uuid[],
  p_venue_names text[],
  p_model text,
  p_model_version text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_month_start date;
  v_month_end date;
  v_bad_venue_count integer;
  v_bad_row_count integer;
  v_monthly_total numeric;
  v_inserted integer := 0;
  v_row jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;
  IF NOT (public.is_super_admin(v_uid) OR public.user_has_tenant(v_uid, p_tenant_id)) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;
  IF p_year IS NULL OR p_month IS NULL OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Invalid year/month';
  END IF;
  IF p_venue_ids IS NULL OR array_length(p_venue_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one venue required';
  END IF;
  IF p_model IS NULL OR p_model_version IS NULL THEN
    RAISE EXCEPTION 'Model and model_version required';
  END IF;
  IF p_model_version NOT IN ('same_weekday_median_12w_v1') THEN
    RAISE EXCEPTION 'Unsupported model_version: %', p_model_version;
  END IF;
  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'No rows supplied';
  END IF;

  v_month_start := make_date(p_year, p_month, 1);
  v_month_end   := (v_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

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

  -- Row-level validation: dates inside requested month, venue_id in requested scope,
  -- observation_count > 0, confidence in allowed set.
  SELECT COUNT(*) INTO v_bad_row_count
    FROM jsonb_array_elements(p_rows) AS r
   WHERE (r->>'target_date')::date < v_month_start
      OR (r->>'target_date')::date > v_month_end
      OR NOT ((r->>'venue_id')::uuid = ANY (p_venue_ids))
      OR COALESCE((r->>'observation_count')::int, 0) < 1
      OR (r->>'confidence') NOT IN ('high','low')
      OR (r->>'amount') IS NULL;
  IF v_bad_row_count > 0 THEN
    RAISE EXCEPTION 'Invalid row payload (date out of month, unknown venue, or missing fields)';
  END IF;

  -- Atomic replace of the generated scope for this month.
  DELETE FROM public.revenue_statistical_targets_daily d
   WHERE d.tenant_id = p_tenant_id
     AND d.venue_id = ANY (p_venue_ids)
     AND d.target_date BETWEEN v_month_start AND v_month_end;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO public.revenue_statistical_targets_daily (
      tenant_id, venue_id, venue_name_snapshot, target_date,
      statistical_target_amount, model, model_version,
      lookback_start, lookback_end, observation_count, confidence,
      generated_at, generated_by
    ) VALUES (
      p_tenant_id,
      (v_row->>'venue_id')::uuid,
      COALESCE(v_row->>'venue_name', ''),
      (v_row->>'target_date')::date,
      (v_row->>'amount')::numeric,
      p_model,
      p_model_version,
      (v_row->>'lookback_start')::date,
      (v_row->>'lookback_end')::date,
      (v_row->>'observation_count')::int,
      v_row->>'confidence',
      now(),
      v_uid
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  -- Monthly total = sum of ALL daily rows currently stored for this tenant/month
  -- (union of the just-replaced scope with any pre-existing venues outside scope).
  SELECT COALESCE(SUM(statistical_target_amount), 0)
    INTO v_monthly_total
    FROM public.revenue_statistical_targets_daily
   WHERE tenant_id = p_tenant_id
     AND target_date BETWEEN v_month_start AND v_month_end;

  -- Update or insert the monthly revenue_targets row. Never touch Manager fields
  -- (target_amount / venues / notes / created_by) if the row already exists.
  IF EXISTS (
    SELECT 1 FROM public.revenue_targets
     WHERE tenant_id = p_tenant_id AND year = p_year AND month = p_month
  ) THEN
    UPDATE public.revenue_targets
       SET statistical_target_amount = v_monthly_total,
           statistical_model = p_model,
           statistical_generated_at = now()
     WHERE tenant_id = p_tenant_id AND year = p_year AND month = p_month;
  ELSE
    INSERT INTO public.revenue_targets (
      tenant_id, year, month, target_amount, venues, notes, created_by,
      statistical_target_amount, statistical_model, statistical_generated_at
    ) VALUES (
      p_tenant_id, p_year, p_month, NULL,
      COALESCE(p_venue_names, ARRAY[]::text[]),
      '', v_uid,
      v_monthly_total, p_model, now()
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'monthly_total', v_monthly_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_statistical_targets_month(uuid, integer, integer, uuid[], text[], text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_statistical_targets_month(uuid, integer, integer, uuid[], text[], text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_statistical_targets_month(uuid, integer, integer, uuid[], text[], text, text, jsonb) TO service_role;
