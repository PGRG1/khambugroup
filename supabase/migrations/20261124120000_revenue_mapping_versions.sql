-- Revenue mapping for clients set up line by line (not KHAMBU, which keeps its fixed fields).
-- Bani maps each printed report line to a type, where it settles and an account. Every save is a
-- version with the date it starts; each day posts with the version in force that day, and a posted
-- day is never re-posted. A day with a line that is not mapped, or that does not balance, is held.

-- 1. Other printed names for a line, and the card processors that settle it.
ALTER TABLE public.sales_report_lines
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS processor_ids uuid[] NOT NULL DEFAULT '{}';

-- 2. Versions: a full copy of the mapping as saved, with the date it starts.
CREATE TABLE IF NOT EXISTS public.sales_mapping_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  effective_from date NOT NULL,
  lines jsonb NOT NULL,
  note text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, version_no)
);
CREATE INDEX IF NOT EXISTS sales_mapping_versions_tenant_from ON public.sales_mapping_versions (tenant_id, effective_from DESC, version_no DESC);
ALTER TABLE public.sales_mapping_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales mapping versions readable" ON public.sales_mapping_versions;
CREATE POLICY "sales mapping versions readable" ON public.sales_mapping_versions FOR SELECT
  USING (public.is_platform_admin() OR public.access_level(tenant_id, 'revenue') >= 1);
-- No write policy: versions are only written by save_sales_mapping.

-- 3. Days held back from the books, and why.
CREATE TABLE IF NOT EXISTS public.sales_posting_holds (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  day date NOT NULL,
  venue text NOT NULL,
  reasons text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, day, venue)
);
ALTER TABLE public.sales_posting_holds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales posting holds readable" ON public.sales_posting_holds;
CREATE POLICY "sales posting holds readable" ON public.sales_posting_holds FOR SELECT
  USING (public.is_platform_admin() OR public.access_level(tenant_id, 'revenue') >= 1);

-- 4. Save the mapping (Bani, or a role with Approve on Finance): replaces the current lines and records a new version.
CREATE OR REPLACE FUNCTION public.save_sales_mapping(p_tenant uuid, p_effective date, p_lines jsonb, p_note text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  x jsonb; v_id uuid; v_keep uuid[] := '{}'; v_seen text[] := '{}'; v_no int; v_i int := 0;
  v_name text; v_kind text; v_cat text; v_acct uuid; v_venue uuid; v_settles text; v_procs uuid[]; v_aliases text[];
  v_snap jsonb; v_key text;
BEGIN
  IF NOT (public.is_platform_admin() OR public.access_level(p_tenant, 'finance') >= 3) THEN
    RAISE EXCEPTION 'You do not have permission to change the revenue mapping'; END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant) THEN RAISE EXCEPTION 'Unknown client'; END IF;
  IF p_effective IS NULL THEN RAISE EXCEPTION 'Choose the date this mapping starts'; END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'Add at least one line'; END IF;
  IF jsonb_array_length(p_lines) > 300 THEN RAISE EXCEPTION 'Too many lines'; END IF;
  IF EXISTS (SELECT 1 FROM public.sales_report_lines WHERE tenant_id = p_tenant AND is_active AND legacy_field IS NOT NULL) THEN
    RAISE EXCEPTION 'This client uses fixed report fields'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('sales_mapping:' || p_tenant::text));

  FOR x IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_i := v_i + 1;
    v_name := btrim(coalesce(x->>'printed_name', ''));
    v_kind := nullif(x->>'kind', '');
    v_cat := nullif(x->>'category', '');
    v_venue := nullif(x->>'venue_id', '')::uuid;
    v_acct := nullif(x->>'gl_account_id', '')::uuid;
    IF v_name = '' OR length(v_name) > 120 THEN RAISE EXCEPTION 'Line % needs a name', v_i; END IF;
    IF v_kind IS NULL OR v_kind NOT IN ('total','subtotal','guests','orders','service_charge','discount','tip','sales','payment','delivery','voucher_sold','voucher_used','deposit_taken','deposit_used','ignore') THEN
      RAISE EXCEPTION '% needs a type', v_name; END IF;
    IF v_kind <> 'sales' THEN v_cat := NULL;
    ELSIF v_cat IS NULL OR v_cat NOT IN ('food','bev_alc','bev_non','dessert','other') THEN RAISE EXCEPTION '% needs a sales group', v_name; END IF;
    IF v_venue IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.venues WHERE id = v_venue AND tenant_id = p_tenant) THEN RAISE EXCEPTION 'Unknown venue for %', v_name; END IF;
    IF v_kind IN ('total','subtotal','guests','orders','ignore') THEN v_acct := NULL;
    ELSIF v_acct IS NULL THEN RAISE EXCEPTION '% needs an account', v_name;
    ELSIF NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE id = v_acct AND tenant_id = p_tenant) THEN RAISE EXCEPTION 'Unknown account for %', v_name; END IF;
    v_procs := coalesce((SELECT array_agg(DISTINCT p::uuid) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(x->'processor_ids') = 'array' THEN x->'processor_ids' ELSE '[]'::jsonb END) p), '{}');
    IF v_kind <> 'payment' THEN v_procs := '{}'; v_settles := NULL;
    ELSE
      v_settles := CASE WHEN x->>'settles_to' = 'cash' THEN 'cash' ELSE 'bank' END;
      IF v_settles = 'cash' THEN v_procs := '{}'; END IF;
      IF EXISTS (SELECT 1 FROM unnest(v_procs) p WHERE NOT EXISTS (SELECT 1 FROM public.payment_processors pp WHERE pp.id = p AND pp.tenant_id = p_tenant)) THEN
        RAISE EXCEPTION 'Unknown card processor for %', v_name; END IF;
    END IF;
    v_aliases := coalesce((SELECT array_agg(DISTINCT btrim(a)) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(x->'aliases') = 'array' THEN x->'aliases' ELSE '[]'::jsonb END) a
                           WHERE btrim(a) <> '' AND length(btrim(a)) <= 120 AND lower(btrim(a)) <> lower(v_name)), '{}');
    v_key := coalesce(v_venue::text, '') || '|' || lower(v_name);
    IF v_key = ANY (v_seen) THEN RAISE EXCEPTION '% is listed twice', v_name; END IF;
    v_seen := v_seen || v_key;

    v_id := NULL;
    IF nullif(x->>'id', '') IS NOT NULL THEN
      SELECT id INTO v_id FROM public.sales_report_lines WHERE id = (x->>'id')::uuid AND tenant_id = p_tenant AND legacy_field IS NULL;
    END IF;
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM public.sales_report_lines
       WHERE tenant_id = p_tenant AND venue_id IS NOT DISTINCT FROM v_venue AND lower(btrim(printed_name)) = lower(v_name) AND NOT (id = ANY (v_keep));
    END IF;
    -- A line that is renamed takes over the name from an old line no longer in the mapping.
    DELETE FROM public.sales_report_lines
     WHERE tenant_id = p_tenant AND venue_id IS NOT DISTINCT FROM v_venue AND lower(btrim(printed_name)) = lower(v_name)
       AND id IS DISTINCT FROM v_id AND NOT (id = ANY (v_keep));
    IF v_id IS NULL THEN
      INSERT INTO public.sales_report_lines (tenant_id, venue_id, printed_name, aliases, kind, category, settles_to, processor_ids, gl_account_id, sort_order, is_active, created_by)
      VALUES (p_tenant, v_venue, v_name, v_aliases, v_kind, v_cat, v_settles, v_procs, v_acct, v_i, true, auth.uid())
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.sales_report_lines
         SET venue_id = v_venue, printed_name = v_name, aliases = v_aliases, kind = v_kind, category = v_cat, settles_to = v_settles,
             processor_ids = v_procs, gl_account_id = v_acct, sort_order = v_i, is_active = true, updated_at = now()
       WHERE id = v_id;
    END IF;
    v_keep := v_keep || v_id;
  END LOOP;

  UPDATE public.sales_report_lines SET is_active = false, updated_at = now()
   WHERE tenant_id = p_tenant AND is_active AND NOT (id = ANY (v_keep));

  SELECT jsonb_agg(jsonb_build_object('id', id, 'venue_id', venue_id, 'printed_name', printed_name, 'aliases', to_jsonb(aliases), 'kind', kind,
           'category', category, 'settles_to', settles_to, 'processor_ids', to_jsonb(processor_ids), 'gl_account_id', gl_account_id, 'sort_order', sort_order)
           ORDER BY sort_order)
    INTO v_snap FROM public.sales_report_lines WHERE tenant_id = p_tenant AND is_active;
  SELECT coalesce(max(version_no), 0) + 1 INTO v_no FROM public.sales_mapping_versions WHERE tenant_id = p_tenant;
  INSERT INTO public.sales_mapping_versions (tenant_id, version_no, effective_from, lines, note, created_by, created_by_name)
  VALUES (p_tenant, v_no, p_effective, coalesce(v_snap, '[]'::jsonb), nullif(btrim(coalesce(p_note, '')), ''), auth.uid(),
          (SELECT display_name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1));
  INSERT INTO public.audit_log (tenant_id, user_id, action, entity_type, entity_id, details)
  VALUES (p_tenant, auth.uid(), 'revenue_mapping_saved', 'sales_mapping_versions', v_no::text,
          jsonb_build_object('title', 'Revenue mapping version ' || v_no, 'effective_from', p_effective, 'lines', jsonb_array_length(coalesce(v_snap, '[]'::jsonb))));
  INSERT INTO public.pending_rebuilds (tenant_id, requested_at, last_source) VALUES (p_tenant, now(), 'sales_mapping_versions')
  ON CONFLICT (tenant_id) DO UPDATE SET requested_at = now(), last_source = 'sales_mapping_versions';
  RETURN v_no;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_sales_mapping(uuid, date, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_sales_mapping(uuid, date, jsonb, text) TO authenticated;

-- 5. Post each day of a line-by-line client from the mapping in force that day. Called by the journal rebuild.
CREATE OR REPLACE FUNCTION public._post_line_mode_sales(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d record; l record; m jsonb; v_lines jsonb; v_scope jsonb; v_posts jsonb; v_reasons text[];
  v_kind text; v_acct uuid; v_amt numeric; v_dr numeric; v_cr numeric; v_venue_id uuid; e_id uuid; cnt int := 0;
  v_src_type text := coalesce(current_setting('bani.accounting.source_type', true), '');
  v_src_id text := current_setting('bani.accounting.source_id', true);
BEGIN
  IF NOT public.is_sales_line_mode(p_tenant_id) THEN RETURN 0; END IF;
  IF v_src_type NOT IN ('', 'sales_summary') THEN RETURN 0; END IF;
  IF v_src_type = '' THEN DELETE FROM public.sales_posting_holds WHERE tenant_id = p_tenant_id; END IF;

  FOR d IN
    SELECT s.date::date AS day, s.venue, (array_agg(s.venue_id) FILTER (WHERE s.venue_id IS NOT NULL))[1] AS venue_id, array_agg(s.id) AS ids
      FROM public.sales_records s
     WHERE s.tenant_id = p_tenant_id AND NOT s.deferred_feed
       AND (v_src_type = '' OR s.date || '__' || s.venue = v_src_id)
     GROUP BY s.date::date, s.venue
  LOOP
    DELETE FROM public.sales_posting_holds WHERE tenant_id = p_tenant_id AND day = d.day AND venue = d.venue;
    IF EXISTS (SELECT 1 FROM public.journal_entries
                WHERE tenant_id = p_tenant_id AND source_type = 'sales_summary' AND source_id = d.day::text || '__' || d.venue
                  AND (coalesce(manually_adjusted, false) OR status = 'posted')) THEN
      CONTINUE;
    END IF;
    v_venue_id := coalesce(d.venue_id, (SELECT id FROM public.venues WHERE tenant_id = p_tenant_id AND name = d.venue LIMIT 1));
    v_reasons := '{}'; v_posts := '[]'::jsonb; v_lines := NULL;
    SELECT lines INTO v_lines FROM public.sales_mapping_versions
     WHERE tenant_id = p_tenant_id AND effective_from <= d.day ORDER BY effective_from DESC, version_no DESC LIMIT 1;
    IF v_lines IS NULL THEN
      v_reasons := ARRAY['No revenue mapping for this date'];
    ELSE
      -- Same rule as the reader: the venue's own lines when it has them, otherwise the all-venues lines.
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_scope FROM jsonb_array_elements(v_lines) x WHERE v_venue_id IS NOT NULL AND x->>'venue_id' = v_venue_id::text;
      IF jsonb_array_length(v_scope) = 0 THEN
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_scope FROM jsonb_array_elements(v_lines) x WHERE coalesce(x->>'venue_id', '') = '';
      END IF;
      FOR l IN
        SELECT rl.line_id, min(rl.printed_name) AS printed_name, round(sum(rl.amount)::numeric, 2) AS amt
          FROM public.sales_record_lines rl
         WHERE rl.tenant_id = p_tenant_id AND rl.sales_record_id = ANY (d.ids)
         GROUP BY rl.line_id, lower(btrim(rl.printed_name))
      LOOP
        IF coalesce(l.amt, 0) = 0 THEN CONTINUE; END IF;
        m := NULL;
        SELECT x INTO m FROM jsonb_array_elements(v_scope) x
         WHERE (l.line_id IS NOT NULL AND x->>'id' = l.line_id::text)
            OR lower(btrim(x->>'printed_name')) = lower(btrim(l.printed_name))
            OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(x->'aliases', '[]'::jsonb)) a WHERE lower(btrim(a)) = lower(btrim(l.printed_name)))
         ORDER BY (x->>'id' = coalesce(l.line_id::text, '')) DESC LIMIT 1;
        IF m IS NULL THEN v_reasons := v_reasons || (l.printed_name || ' is not mapped'); CONTINUE; END IF;
        v_kind := m->>'kind';
        IF v_kind IN ('total', 'subtotal', 'guests', 'orders', 'ignore') THEN CONTINUE; END IF;
        v_acct := nullif(m->>'gl_account_id', '')::uuid;
        IF v_acct IS NULL OR NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE id = v_acct AND tenant_id = p_tenant_id) THEN
          v_reasons := v_reasons || ((m->>'printed_name') || ' has no account'); CONTINUE;
        END IF;
        v_amt := l.amt;
        IF v_kind = 'discount' THEN v_amt := -abs(v_amt); END IF;   -- a discount reduces sales: debit
        IF v_kind = 'tip' THEN v_amt := abs(v_amt); END IF;         -- tips are owed to staff: credit
        IF v_kind IN ('payment', 'delivery', 'voucher_used', 'deposit_used') THEN
          v_dr := CASE WHEN v_amt > 0 THEN v_amt ELSE 0 END; v_cr := CASE WHEN v_amt < 0 THEN -v_amt ELSE 0 END;
        ELSE
          v_cr := CASE WHEN v_amt > 0 THEN v_amt ELSE 0 END; v_dr := CASE WHEN v_amt < 0 THEN -v_amt ELSE 0 END;
        END IF;
        v_posts := v_posts || jsonb_build_object('account', v_acct, 'dr', v_dr, 'cr', v_cr, 'memo', m->>'printed_name', 'line', m->>'id', 'amount', l.amt);
      END LOOP;
      IF cardinality(v_reasons) = 0 THEN
        SELECT coalesce(sum((p->>'dr')::numeric), 0), coalesce(sum((p->>'cr')::numeric), 0) INTO v_dr, v_cr FROM jsonb_array_elements(v_posts) p;
        IF round(v_dr - v_cr, 2) <> 0 THEN
          v_reasons := ARRAY['Payments and sales differ by ' || to_char(abs(round(v_dr - v_cr, 2)), 'FM999,999,990.00')];
        ELSIF jsonb_array_length(v_posts) < 2 THEN
          CONTINUE;
        END IF;
      END IF;
    END IF;

    IF cardinality(v_reasons) > 0 THEN
      INSERT INTO public.sales_posting_holds (tenant_id, day, venue, reasons, updated_at) VALUES (p_tenant_id, d.day, d.venue, v_reasons, now())
      ON CONFLICT (tenant_id, day, venue) DO UPDATE SET reasons = EXCLUDED.reasons, updated_at = now();
      CONTINUE;
    END IF;

    INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status, tenant_id)
    VALUES (d.day, 'Sales summary — ' || d.venue, 'sales_summary', d.day::text || '__' || d.venue, d.venue, 'draft', p_tenant_id)
    RETURNING id INTO e_id;
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo, source_amount, mapping_rule_type, mapping_match_key, mapping_status, tenant_id)
    SELECT e_id, (p->>'account')::uuid, (p->>'dr')::numeric, (p->>'cr')::numeric, d.venue, o::int, p->>'memo', (p->>'amount')::numeric,
           'sales_report_line', p->>'line', 'mapped', p_tenant_id
      FROM jsonb_array_elements(v_posts) WITH ORDINALITY AS t(p, o)
     WHERE (p->>'dr')::numeric <> 0 OR (p->>'cr')::numeric <> 0;
    UPDATE public.journal_entries SET status = 'posted' WHERE id = e_id;
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$function$;
REVOKE ALL ON FUNCTION public._post_line_mode_sales(uuid) FROM PUBLIC, anon, authenticated;

-- 6. The journal rebuild calls it right after the fixed-field sales (which already skip line-by-line clients).
DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public._rebuild_journal_from_operations_impl'::regproc);
  IF position('_post_line_mode_sales' IN d) = 0 THEN
    d := replace(d, E'  IF acc_ap IS NOT NULL THEN\n    FOR inv IN',
                    E'  cnt := cnt + public._post_line_mode_sales(p_tenant_id);\n\n  IF acc_ap IS NOT NULL THEN\n    FOR inv IN');
    IF position('_post_line_mode_sales' IN d) = 0 THEN RAISE EXCEPTION 'Journal rebuild: insert point not found'; END IF;
    EXECUTE d;
  END IF;
END
$do$;
