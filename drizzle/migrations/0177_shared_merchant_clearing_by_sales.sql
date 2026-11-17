-- Shared card merchants (one processor merchant for several venues).
-- The statement doesn't say which venue each payment came from, but the books already do:
-- each venue's sales day recorded its card money per card type. So a shared payout clears
-- each venue by its own recorded card sales for that day and card type. Exact when the till
-- agrees with the statement; otherwise the difference is shared in the same proportion.
-- Settlement evidence (lines, transactions) is never changed. If nothing was recorded for
-- that day and card type, the payout is still skipped and logged, as before.

CREATE OR REPLACE FUNCTION public.settlement_line_allocations(t uuid, b uuid)
RETURNS TABLE(clearing_venue text, amount numeric, payment_method text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  m public.payment_processor_merchants%ROWTYPE;
  d date;
  l record;
  k text;
  tot numeric;
  vs text[];
  ss numeric[];
  given numeric;
  share numeric;
  i int;
BEGIN
  SELECT mm.* INTO m
  FROM public.payment_processor_merchants mm
  JOIN public.payment_settlement_batches bb ON bb.merchant_id = mm.id AND bb.tenant_id = mm.tenant_id
  WHERE bb.id = b AND bb.tenant_id = t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement merchant missing'; END IF;
  SELECT bb.transaction_date INTO d FROM public.payment_settlement_batches bb WHERE bb.id = b AND bb.tenant_id = t;

  FOR l IN
    SELECT pl.venue AS line_venue, pl.gross_amount AS gross, pl.payment_type AS ptype
    FROM public.payment_settlement_lines pl
    WHERE pl.batch_id = b AND pl.tenant_id = t
    ORDER BY pl.id
  LOOP
    -- Line venue given, or a one-venue merchant: unchanged rule.
    IF nullif(l.line_venue, '') IS NOT NULL OR m.venue IS NOT NULL THEN
      clearing_venue := public.settlement_clearing_venue(t, b, l.line_venue);
      amount := l.gross; payment_method := l.ptype;
      RETURN NEXT; CONTINUE;
    END IF;

    -- Shared merchant: each venue's recorded card sales for this day and card type.
    k := regexp_replace(lower(coalesce(l.ptype, '')), '_foreign$', '');
    SELECT array_agg(x.v ORDER BY x.v), array_agg(x.s ORDER BY x.v), coalesce(sum(x.s), 0)
      INTO vs, ss, tot
    FROM (
      SELECT jl.venue AS v, sum(jl.debit - jl.credit) AS s
      FROM public.journal_lines jl
      JOIN public.journal_entries je ON je.id = jl.entry_id AND je.tenant_id = t
      WHERE jl.tenant_id = t
        AND je.source_type = 'sales_summary'
        AND je.entry_date = d
        AND jl.mapping_rule_type = 'payment_settlement_clearing'
        AND jl.payment_method = k
        AND jl.venue = ANY (coalesce(m.shared_venues, ARRAY[]::text[]))
      GROUP BY jl.venue
      HAVING sum(jl.debit - jl.credit) > 0
    ) x;

    IF tot IS NULL OR tot <= 0 OR vs IS NULL THEN
      clearing_venue := NULL; amount := l.gross; payment_method := l.ptype;  -- can't place: caller skips and logs
      RETURN NEXT; CONTINUE;
    END IF;

    given := 0;
    FOR i IN 1 .. array_length(vs, 1) LOOP
      IF i = array_length(vs, 1) THEN
        share := round(l.gross - given, 2);
      ELSE
        share := round(l.gross * ss[i] / tot, 2);
        given := given + share;
      END IF;
      clearing_venue := vs[i]; amount := share; payment_method := l.ptype;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.settlement_line_allocations(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settlement_line_allocations(uuid, uuid) TO authenticated, service_role;

-- Ledger rebuild: use the allocations for the venue check, the mapping check and the clearing lines.
DO $patch$
DECLARE r record; d text; n text;
  a1 text := $x$IF EXISTS(SELECT 1 FROM public.payment_settlement_lines l WHERE l.batch_id=sb.id AND l.tenant_id=p_tenant_id AND coalesce(nullif(l.venue,''),sb.merchant_venue) IS NULL) THEN$x$;
  b1 text := $x$IF EXISTS(SELECT 1 FROM public.settlement_line_allocations(p_tenant_id,sb.id) a WHERE a.clearing_venue IS NULL) THEN$x$;
  a2 text := $x$PERFORM public.settlement_clearing_venue(p_tenant_id,sb.id,l.venue) FROM public.payment_settlement_lines l WHERE l.batch_id=sb.id AND l.tenant_id=p_tenant_id;$x$;
  b2 text := $x$PERFORM 1;$x$;
  a3 text := $x$IF EXISTS(SELECT 1 FROM public.payment_settlement_lines l WHERE l.batch_id=sb.id AND l.tenant_id=p_tenant_id AND NOT EXISTS(SELECT 1 FROM public.account_mapping_rules a WHERE a.tenant_id=p_tenant_id AND a.rule_type='payment_settlement_clearing' AND a.match_key=public.settlement_clearing_venue(p_tenant_id,sb.id,l.venue))) THEN$x$;
  b3 text := $x$IF EXISTS(SELECT 1 FROM public.settlement_line_allocations(p_tenant_id,sb.id) l WHERE NOT EXISTS(SELECT 1 FROM public.account_mapping_rules a WHERE a.tenant_id=p_tenant_id AND a.rule_type='payment_settlement_clearing' AND a.match_key=l.clearing_venue)) THEN$x$;
  a4 text := $x$SELECT public.settlement_clearing_venue(p_tenant_id,sb.id,l.venue) AS clearing_venue, l.gross_amount AS amount, l.payment_type AS payment_method
        FROM public.payment_settlement_lines l
        WHERE l.tenant_id = p_tenant_id AND l.batch_id = sb.id$x$;
  b4 text := $x$SELECT l.clearing_venue, l.amount, l.payment_method
        FROM public.settlement_line_allocations(p_tenant_id,sb.id) l$x$;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
           WHERE s.nspname = 'public' AND p.proname = '_rebuild_journal_from_operations_impl' LOOP
    d := pg_get_functiondef(r.oid);
    IF (length(d) - length(replace(d, a1, ''))) <> length(a1) THEN RAISE EXCEPTION 'shared venue check anchor not found exactly once'; END IF;
    IF (length(d) - length(replace(d, a2, ''))) <> length(a2) THEN RAISE EXCEPTION 'venue validation anchor not found exactly once'; END IF;
    IF (length(d) - length(replace(d, a3, ''))) <> length(a3) THEN RAISE EXCEPTION 'mapping check anchor not found exactly once'; END IF;
    IF (length(d) - length(replace(d, a4, ''))) <> length(a4) THEN RAISE EXCEPTION 'clearing lines anchor not found exactly once'; END IF;
    n := replace(replace(replace(replace(d, a1, b1), a2, b2), a3, b3), a4, b4);
    EXECUTE n;
  END LOOP;
END $patch$;

-- Book the shared payouts that were skipped before.
INSERT INTO public.pending_rebuilds (tenant_id, requested_at, last_source)
SELECT DISTINCT bb.tenant_id, now(), 'shared_merchant_clearing'
FROM public.payment_settlement_batches bb
JOIN public.payment_processor_merchants mm ON mm.id = bb.merchant_id AND mm.tenant_id = bb.tenant_id
WHERE mm.venue IS NULL AND bb.bank_transaction_id IS NOT NULL
ON CONFLICT (tenant_id) DO UPDATE SET requested_at = now(), last_source = 'shared_merchant_clearing';
