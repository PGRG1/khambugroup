-- Opening assets, the ERP way: assets owned before the books start go into the register with their cost and
-- depreciation to date and NO journal — the opening trial balance already holds those balances, and Books setup
-- checks the register against it. Monthly depreciation then carries on from the books start.

ALTER TABLE public.fixed_assets ADD COLUMN IF NOT EXISTS is_opening boolean NOT NULL DEFAULT false;
-- Depreciation to date when the asset came in (amount_depreciated keeps growing as months post).
ALTER TABLE public.fixed_assets ADD COLUMN IF NOT EXISTS opening_depreciation numeric(14,2) NOT NULL DEFAULT 0;
UPDATE public.fixed_assets f SET is_opening = true,
  opening_depreciation = greatest(0, f.amount_depreciated - coalesce((SELECT sum(posted_amount) FROM fixed_asset_depreciation_schedule s WHERE s.asset_id = f.id AND s.status = 'posted'), 0))
 WHERE NOT f.is_opening AND (f.notes ILIKE 'Brought in at opening%' OR f.notes = 'Approved opening asset');

-- p: {name, class_key, venue?, cost, date (in use), depreciated, life_months?}
CREATE OR REPLACE FUNCTION public.add_opening_asset(t uuid, p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c asset_classes; s asset_settings; a uuid; cost numeric := round((p->>'cost')::numeric, 2);
        depr numeric := round(coalesce((p->>'depreciated')::numeric, 0), 2); life int; d date := (p->>'date')::date;
        v venues; nm text := btrim(coalesce(p->>'name',''));
BEGIN
  IF NOT public.can_edit_account_rules(t) THEN RAISE EXCEPTION 'Only a books approver can add opening assets'; END IF;
  PERFORM public._seed_asset_policy(t);
  SELECT * INTO c FROM asset_classes WHERE tenant_id = t AND class_key = p->>'class_key';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pick the asset class'; END IF;
  IF c.asset_account_id IS NULL THEN RAISE EXCEPTION 'Set the % account in Settings › Assets', c.name; END IF;
  SELECT * INTO s FROM asset_settings WHERE tenant_id = t;
  IF s.accum_account_id IS NULL OR s.expense_account_id IS NULL THEN RAISE EXCEPTION 'Set the depreciation accounts in Settings › Assets'; END IF;
  life := coalesce(nullif(p->>'life_months','')::int, c.useful_years * 12);
  IF nm = '' THEN RAISE EXCEPTION 'Name the asset'; END IF;
  IF d IS NULL THEN RAISE EXCEPTION 'Pick the date it came into use'; END IF;
  IF cost IS NULL OR cost <= 0 OR depr < 0 OR depr > cost OR life <= 0 OR life > 600 THEN RAISE EXCEPTION 'Check the cost, depreciation and life'; END IF;
  IF nullif(p->>'venue','') IS NOT NULL THEN
    SELECT * INTO v FROM venues WHERE tenant_id = t AND name = p->>'venue';
    IF NOT FOUND THEN RAISE EXCEPTION 'Venue not found'; END IF;
  END IF;
  INSERT INTO fixed_assets (tenant_id, asset_tag, name, category, purchase_date, in_service_date, cost, salvage_value, useful_life_months,
    method, venue_id, venue, asset_account_id, accumulated_depr_account_id, expense_account_id, amount_depreciated, amount_remaining,
    status, notes, is_opening, opening_depreciation, created_by)
  VALUES (t, 'OPEN-'||left(gen_random_uuid()::text, 8), nm, c.class_key, d, d, cost, 0, life,
    'straight_line', v.id, v.name, c.asset_account_id, s.accum_account_id, s.expense_account_id, depr, cost - depr,
    CASE WHEN depr >= cost THEN 'fully_depreciated' ELSE 'active' END, 'Opening asset', true, depr, auth.uid())
  RETURNING id INTO a;
  RETURN a;
END $$;

-- Only while nothing has been depreciated on it in Bani.
CREATE OR REPLACE FUNCTION public.remove_opening_asset(t uuid, p_asset uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_edit_account_rules(t) THEN RAISE EXCEPTION 'Only a books approver can remove opening assets'; END IF;
  IF NOT EXISTS (SELECT 1 FROM fixed_assets WHERE id = p_asset AND tenant_id = t AND is_opening) THEN RAISE EXCEPTION 'Opening asset not found'; END IF;
  IF EXISTS (SELECT 1 FROM fixed_asset_depreciation_schedule WHERE asset_id = p_asset AND status = 'posted')
     OR EXISTS (SELECT 1 FROM finance_entry_drafts WHERE tenant_id = t AND source_data->>'asset' = p_asset::text AND status IN ('waiting','approved')) THEN
    RAISE EXCEPTION 'Depreciation already started on this asset';
  END IF;
  DELETE FROM fixed_asset_depreciation_schedule WHERE asset_id = p_asset AND tenant_id = t;
  DELETE FROM fixed_assets WHERE id = p_asset AND tenant_id = t;
END $$;

REVOKE ALL ON FUNCTION public.add_opening_asset(uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_opening_asset(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_opening_asset(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_opening_asset(uuid,uuid) TO authenticated;

-- One path: the old opening intake posted its own journal against equity, which double counts once the opening
-- trial balance is posted. The app now uses add_opening_asset.
REVOKE EXECUTE ON FUNCTION public.finance_opening_asset(uuid,jsonb) FROM PUBLIC, anon, authenticated;
-- Unused and without a tenant check; month-end depreciation runs through finance_schedule_prepare.
REVOKE EXECUTE ON FUNCTION public.post_depreciation_period(uuid,integer,integer) FROM PUBLIC, anon, authenticated;

-- Month-end depreciation worked only for charts using codes 6900 / 1550; the master chart (e.g. 6800 / 1590)
-- never depreciated. Accept the client's own depreciation accounts by type and name instead of fixed codes.
DO $patch$
DECLARE d text := pg_get_functiondef('public.finance_schedule_prepare'::regproc);
        old text := $o$AND EXISTS(SELECT 1 FROM chart_of_accounts WHERE id=a.expense_account_id AND code='6900' AND lower(name) LIKE '%depreciation%') AND EXISTS(SELECT 1 FROM chart_of_accounts WHERE id=a.accumulated_depr_account_id AND code='1550')$o$;
        new text := $n$AND EXISTS(SELECT 1 FROM chart_of_accounts WHERE id=a.expense_account_id AND tenant_id=t AND account_type IN ('opex','other_expense','cogs') AND lower(name) LIKE '%depreciation%') AND EXISTS(SELECT 1 FROM chart_of_accounts WHERE id=a.accumulated_depr_account_id AND tenant_id=t AND account_type='asset' AND lower(name) LIKE '%accumulated depreciation%')$n$;
BEGIN
  IF position(old IN d) = 0 THEN
    IF position(new IN d) > 0 THEN RETURN; END IF;
    RAISE EXCEPTION 'finance_schedule_prepare changed; depreciation account check not found';
  END IF;
  EXECUTE replace(d, old, new);
END $patch$;
