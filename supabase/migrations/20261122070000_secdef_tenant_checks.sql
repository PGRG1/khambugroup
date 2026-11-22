-- Tenant isolation for SECURITY DEFINER functions. These run with full rights and take a business id,
-- but did not check that the caller belongs to that business, so any signed-in user could call them
-- for another business.
-- 1) Internal helpers the app never calls directly: callable only by the server (service role) and by
--    other database functions (which run as their owner).
-- 2) Functions the app does call: a membership check is added. Bani platform admins keep access.

-- 1) Internal only.
REVOKE EXECUTE ON FUNCTION public._finance_transfer_pair(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_prepaid_schedule(uuid, uuid, uuid, uuid, uuid, text, numeric, uuid, uuid, date, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_depreciation_period(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finance_fx_draft_finish(uuid, public.finance_entry_drafts, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finance_fx_draft_check(uuid, public.finance_entry_drafts) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finance_opening_equity_account(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finance_schedule_account(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fx_realised_account(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fx_difference_account(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finance_invoice_asset_account(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finance_source_drift_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_sales_line_mode(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settlement_clearing_venue(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settlement_line_allocations(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._finance_transfer_pair(uuid, uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_prepaid_schedule(uuid, uuid, uuid, uuid, uuid, text, numeric, uuid, uuid, date, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_depreciation_period(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_fx_draft_finish(uuid, public.finance_entry_drafts, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_fx_draft_check(uuid, public.finance_entry_drafts) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_opening_equity_account(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_schedule_account(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fx_realised_account(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fx_difference_account(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_invoice_asset_account(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_source_drift_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_sales_line_mode(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.settlement_clearing_venue(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.settlement_line_allocations(uuid, uuid) TO service_role;

-- 2a) Revenue event (called by the app): caller must belong to the business, and the venue too.
--     finance_fx_fee_account is also called by an invoker function, so it keeps EXECUTE with a check.
DO $gate$
DECLARE d text; g text;
BEGIN
  d := pg_get_functiondef('public.add_revenue_event_with_replacement(uuid,uuid,date,text,text,uuid,text,numeric,numeric,numeric,text)'::regprocedure);
  IF position('/* bani: tenant gate */' in d) = 0 THEN
    IF (length(d) - length(replace(d, 'BEGIN', ''))) / 5 <> 1 THEN RAISE EXCEPTION 'add_revenue_event_with_replacement: BEGIN not found exactly once'; END IF;
    g := $g$BEGIN /* bani: tenant gate */
  IF auth.uid() IS NOT NULL AND NOT (public.is_platform_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), p_tenant_id)) THEN
    RAISE EXCEPTION 'Not allowed for this business' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.venues v WHERE v.id = p_venue_id AND v.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'Venue does not belong to this business' USING ERRCODE = '42501';
  END IF;$g$;
    EXECUTE replace(d, 'BEGIN', g);
  END IF;

  d := pg_get_functiondef('public.finance_fx_fee_account(uuid)'::regprocedure);
  IF position('/* bani: tenant gate */' in d) = 0 THEN
    IF (length(d) - length(replace(d, 'BEGIN', ''))) / 5 <> 1 THEN RAISE EXCEPTION 'finance_fx_fee_account: BEGIN not found exactly once'; END IF;
    EXECUTE replace(d, 'BEGIN', $g$BEGIN /* bani: tenant gate */ IF auth.uid() IS NOT NULL AND NOT (public.is_platform_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), t)) THEN RAISE EXCEPTION 'Not allowed for this business' USING ERRCODE = '42501'; END IF;$g$);
  END IF;
END $gate$;

-- 2b) Stock totals (called by the app): only the caller's business; no business given = nothing
--     (it used to return every business's totals).
CREATE OR REPLACE FUNCTION public.get_inventory_aggregates(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(product_master_id uuid, total_qty numeric, total_spend numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH ok AS (
    SELECT p_tenant_id IS NOT NULL AND (auth.uid() IS NULL OR public.is_platform_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), p_tenant_id)) AS allowed
  ), grn_agg AS (
    SELECT gi.product_master_id, SUM(COALESCE(gi.accepted_qty, gi.quantity_received)) AS qty,
      SUM(COALESCE(gi.accepted_qty, gi.quantity_received) * gi.unit_cost) AS spend
    FROM public.grn_items gi JOIN public.goods_received_notes g ON g.id = gi.grn_id JOIN public.product_master pm ON pm.id = gi.product_master_id
    WHERE (SELECT allowed FROM ok) AND gi.product_master_id IS NOT NULL AND g.status IN ('confirmed','disputed')
      AND gi.tenant_id = p_tenant_id AND pm.creates_stock_movement = true AND COALESCE(pm.financial_treatment, '') NOT ILIKE 'Asset%'
    GROUP BY gi.product_master_id
  ), waste_agg AS (
    SELECT w.product_master_id, SUM(w.quantity) AS qty, SUM(w.quantity * w.unit_cost) AS spend
    FROM public.inventory_movements_waste w JOIN public.product_master pm ON pm.id = w.product_master_id
    WHERE (SELECT allowed FROM ok) AND w.product_master_id IS NOT NULL AND w.tenant_id = p_tenant_id
      AND pm.creates_stock_movement = true AND COALESCE(pm.financial_treatment, '') NOT ILIKE 'Asset%'
    GROUP BY w.product_master_id
  )
  SELECT pid AS product_master_id, COALESCE(SUM(qty), 0)::numeric AS total_qty, COALESCE(SUM(spend), 0)::numeric AS total_spend
  FROM (SELECT product_master_id AS pid, qty, spend FROM grn_agg UNION ALL SELECT product_master_id AS pid, -qty AS qty, -spend AS spend FROM waste_agg) u
  GROUP BY pid;
$function$;

-- 2c) Manual-booking check (called by the app): only the caller's business.
CREATE OR REPLACE FUNCTION public.expense_manual_booked(t uuid, a uuid, m date, amt numeric)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT (auth.uid() IS NULL OR public.is_platform_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), t))
    AND EXISTS(SELECT 1 FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id
      WHERE e.tenant_id=t AND e.status='posted' AND e.source_type='manual' AND e.entry_date>=date_trunc('month',m)::date
        AND e.entry_date<date_trunc('month',m)+interval '1 month' AND l.account_id=a
      GROUP BY e.id HAVING abs(sum(l.debit-l.credit)-amt)<.01)
$function$;
