-- Asset policy per client: when a purchase is an asset, each class's account and years, and where depreciation posts.
-- Bani reads it when an equipment bill is booked; defaults come from the client's own chart (master or older codes).

CREATE TABLE IF NOT EXISTS public.asset_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  threshold numeric(14,2) NOT NULL DEFAULT 5000 CHECK (threshold >= 0),
  accum_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  expense_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.asset_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  class_key text NOT NULL CHECK (class_key IN ('kitchen_equipment','furniture_fixtures','it_equipment','leasehold_improvements')),
  name text NOT NULL,
  asset_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  useful_years int NOT NULL CHECK (useful_years BETWEEN 1 AND 50),
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, class_key)
);
ALTER TABLE public.asset_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS asset_settings_read ON public.asset_settings;
CREATE POLICY asset_settings_read ON public.asset_settings FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(), tenant_id));
DROP POLICY IF EXISTS asset_settings_write ON public.asset_settings;
CREATE POLICY asset_settings_write ON public.asset_settings FOR UPDATE TO authenticated USING (public.finance_schedule_manager(tenant_id)) WITH CHECK (public.finance_schedule_manager(tenant_id));
DROP POLICY IF EXISTS asset_classes_read ON public.asset_classes;
CREATE POLICY asset_classes_read ON public.asset_classes FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(), tenant_id));
DROP POLICY IF EXISTS asset_classes_write ON public.asset_classes;
CREATE POLICY asset_classes_write ON public.asset_classes FOR UPDATE TO authenticated USING (public.finance_schedule_manager(tenant_id)) WITH CHECK (public.finance_schedule_manager(tenant_id));
GRANT SELECT, UPDATE ON public.asset_settings, public.asset_classes TO authenticated;

-- Accounts must belong to the same client.
CREATE OR REPLACE FUNCTION public._asset_policy_same_tenant() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'asset_classes' THEN
    IF NEW.asset_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE id = NEW.asset_account_id AND tenant_id = NEW.tenant_id AND account_type = 'asset') THEN RAISE EXCEPTION 'Asset account must be one of this client''s asset accounts'; END IF;
  ELSE
    IF NEW.accum_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE id = NEW.accum_account_id AND tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'Account must belong to this client'; END IF;
    IF NEW.expense_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE id = NEW.expense_account_id AND tenant_id = NEW.tenant_id) THEN RAISE EXCEPTION 'Account must belong to this client'; END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS asset_classes_same_tenant ON public.asset_classes;
CREATE TRIGGER asset_classes_same_tenant BEFORE INSERT OR UPDATE ON public.asset_classes FOR EACH ROW EXECUTE FUNCTION public._asset_policy_same_tenant();
DROP TRIGGER IF EXISTS asset_settings_same_tenant ON public.asset_settings;
CREATE TRIGGER asset_settings_same_tenant BEFORE INSERT OR UPDATE ON public.asset_settings FOR EACH ROW EXECUTE FUNCTION public._asset_policy_same_tenant();

-- Defaults from the client's own chart, by account name (works for the master chart and older charts).
CREATE OR REPLACE FUNCTION public._seed_asset_policy(p_tenant uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acct uuid; r record;
BEGIN
  INSERT INTO asset_settings (tenant_id, accum_account_id, expense_account_id)
  VALUES (p_tenant,
    (SELECT id FROM chart_of_accounts WHERE tenant_id = p_tenant AND is_active AND name ILIKE 'Accumulated Depreciation%' ORDER BY code LIMIT 1),
    (SELECT id FROM chart_of_accounts WHERE tenant_id = p_tenant AND is_active AND account_type IN ('opex','other_expense') AND name ILIKE 'Depreciation%' ORDER BY code LIMIT 1))
  ON CONFLICT (tenant_id) DO NOTHING;
  -- A chart loaded after the policy was made fills in what was missing.
  UPDATE asset_settings SET
    accum_account_id = coalesce(accum_account_id, (SELECT id FROM chart_of_accounts WHERE tenant_id = p_tenant AND is_active AND name ILIKE 'Accumulated Depreciation%' ORDER BY code LIMIT 1)),
    expense_account_id = coalesce(expense_account_id, (SELECT id FROM chart_of_accounts WHERE tenant_id = p_tenant AND is_active AND account_type IN ('opex','other_expense') AND name ILIKE 'Depreciation%' ORDER BY code LIMIT 1))
  WHERE tenant_id = p_tenant AND (accum_account_id IS NULL OR expense_account_id IS NULL);
  FOR r IN SELECT * FROM (VALUES ('kitchen_equipment','Kitchen equipment','Kitchen Equipment',5,10), ('furniture_fixtures','Furniture & fixtures','Furniture & Fixtures',5,20), ('it_equipment','IT equipment','IT Equipment',3,30), ('leasehold_improvements','Leasehold improvements','Leasehold Improvements',5,40)) v(k, label, acct_name, yrs, so) LOOP
    SELECT id INTO acct FROM chart_of_accounts WHERE tenant_id = p_tenant AND is_active AND account_type = 'asset' AND name ILIKE r.acct_name ORDER BY code LIMIT 1;
    INSERT INTO asset_classes (tenant_id, class_key, name, asset_account_id, useful_years, sort_order) VALUES (p_tenant, r.k, r.label, acct, r.yrs, r.so) ON CONFLICT (tenant_id, class_key) DO UPDATE SET asset_account_id = coalesce(asset_classes.asset_account_id, EXCLUDED.asset_account_id);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public._seed_asset_policy(uuid) FROM PUBLIC, anon, authenticated;

-- The app asks for the policy; it is created the first time with the defaults above.
CREATE OR REPLACE FUNCTION public.ensure_asset_policy(p_tenant uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.user_has_tenant(auth.uid(), p_tenant) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  PERFORM public._seed_asset_policy(p_tenant);
END $$;
REVOKE ALL ON FUNCTION public.ensure_asset_policy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_asset_policy(uuid) TO authenticated;

-- Existing clients get their policy now.
SELECT public._seed_asset_policy(id) FROM public.tenants;

-- Booking an asset from a bill uses the client's policy; clients without a match keep the older fixed codes.
CREATE OR REPLACE FUNCTION public.capitalize_bill_allocation(p_allocation_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a          expense_bill_allocations%ROWTYPE;
  b          expense_bills%ROWTYPE;
  v_asset_id uuid;
  v_asset_acct uuid;
  v_accum_acct uuid;
  v_expense_acct uuid;
  v_category text;
  v_life int;
  v_in_service date;
  v_salvage numeric(14,2);
  v_depreciable numeric(14,2);
  v_per_month numeric(14,2);
  v_sum numeric(14,2) := 0;
  v_last numeric(14,2);
  v_period_year int;
  v_period_month int;
  v_amount numeric(14,2);
  i int;
  v_venue_id uuid;
  v_venue text;
BEGIN
  SELECT * INTO a FROM expense_bill_allocations WHERE id = p_allocation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Allocation % not found', p_allocation_id; END IF;
  IF NOT public.finance_schedule_manager(a.tenant_id) THEN RAISE EXCEPTION 'Owner or admin required';END IF;IF NOT EXISTS(SELECT 1 FROM public.expense_bills WHERE tenant_id=a.tenant_id AND id=a.bill_id AND approval_status IN('draft','pending_review','approved')) THEN RAISE EXCEPTION 'Unposted source bill required';END IF; IF NOT a.capitalize THEN RAISE EXCEPTION 'Allocation % is not flagged capitalize', p_allocation_id; END IF;

  -- Idempotency: if an asset already exists for this allocation, return it.
  SELECT id INTO v_asset_id FROM fixed_assets WHERE source_allocation_id = a.id;
  IF v_asset_id IS NOT NULL THEN RETURN v_asset_id; END IF;

  SELECT * INTO b FROM expense_bills WHERE id = a.bill_id;

  v_category := COALESCE(a.asset_category, 'other');
  v_life := COALESCE(a.useful_life_months, 0);
  IF v_life <= 0 THEN RAISE EXCEPTION 'Allocation % missing useful_life_months', p_allocation_id; END IF;
  v_in_service := COALESCE(a.in_service_date, b.bill_date);
  v_salvage := COALESCE(a.salvage_value, 0);
  IF v_salvage >= a.amount THEN RAISE EXCEPTION 'Salvage value must be less than cost'; END IF;

  -- Resolve accounts: the client's asset policy first.
  PERFORM public._seed_asset_policy(a.tenant_id);
  SELECT asset_account_id INTO v_asset_acct FROM asset_classes WHERE tenant_id = a.tenant_id AND class_key = v_category;
  SELECT accum_account_id, expense_account_id INTO v_accum_acct, v_expense_acct FROM asset_settings WHERE tenant_id = a.tenant_id;
  -- Older fixed codes when the policy has no account.
  v_asset_acct := COALESCE(v_asset_acct, CASE v_category
    WHEN 'furniture_fixtures'     THEN (SELECT id FROM chart_of_accounts WHERE tenant_id=a.tenant_id AND code='1510')
    WHEN 'kitchen_equipment'      THEN (SELECT id FROM chart_of_accounts WHERE tenant_id=a.tenant_id AND code='1520')
    WHEN 'it_equipment'           THEN (SELECT id FROM chart_of_accounts WHERE tenant_id=a.tenant_id AND code='1530')
    WHEN 'leasehold_improvements' THEN (SELECT id FROM chart_of_accounts WHERE tenant_id=a.tenant_id AND code='1540')
    ELSE (SELECT id FROM chart_of_accounts WHERE tenant_id=a.tenant_id AND code='1500' AND account_type='asset' AND is_active)
  END);
  IF v_asset_acct IS NULL THEN RAISE EXCEPTION 'Asset GL account not resolved for category %', v_category; END IF;
  v_accum_acct := COALESCE(v_accum_acct, (SELECT id FROM chart_of_accounts WHERE tenant_id=a.tenant_id AND code='1550'));
  v_expense_acct := COALESCE(v_expense_acct, (SELECT id FROM chart_of_accounts WHERE tenant_id=a.tenant_id AND code='6900'));
  IF v_accum_acct IS NULL OR v_expense_acct IS NULL THEN RAISE EXCEPTION 'Depreciation accounts missing: set them in Settings › Assets'; END IF;

  -- Venue: allocation overrides bill header
  v_venue := COALESCE(a.venue, b.venue);
  SELECT id INTO v_venue_id FROM venues WHERE tenant_id=a.tenant_id AND name = v_venue LIMIT 1;
  IF v_venue_id IS NULL THEN v_venue_id := b.venue_id; END IF;

  -- Redirect allocation GL to the asset account so the bill posts Dr 15xx / Cr AP
  UPDATE expense_bill_allocations SET account_id = v_asset_acct WHERE id = a.id;

  INSERT INTO fixed_assets (
    tenant_id, name, category, purchase_date, in_service_date, cost, salvage_value,
    useful_life_months, method, venue_id, venue, supplier_id, source_bill_id, source_allocation_id,
    asset_account_id, accumulated_depr_account_id, expense_account_id,
    amount_depreciated, amount_remaining, created_by
  ) VALUES (
    a.tenant_id, COALESCE(a.asset_name, b.vendor_name, 'Asset'), v_category, b.bill_date, v_in_service,
    a.amount, v_salvage, v_life, 'straight_line', v_venue_id, v_venue, b.supplier_id, b.id, a.id,
    v_asset_acct, v_accum_acct, v_expense_acct, 0, a.amount - v_salvage, b.created_by
  ) RETURNING id INTO v_asset_id;

  -- Generate schedule
  v_depreciable := a.amount - v_salvage;
  v_per_month := round(v_depreciable / v_life, 2);
  v_period_year := extract(year from v_in_service)::int;
  v_period_month := extract(month from v_in_service)::int;

  FOR i IN 1..v_life LOOP
    IF i = v_life THEN
      v_amount := v_depreciable - v_sum;
    ELSE
      v_amount := v_per_month;
      v_sum := v_sum + v_amount;
    END IF;
    INSERT INTO fixed_asset_depreciation_schedule
      (tenant_id, asset_id, period_year, period_month, sequence_no, scheduled_amount)
      VALUES (a.tenant_id, v_asset_id, v_period_year, v_period_month, i, v_amount);
    v_period_month := v_period_month + 1;
    IF v_period_month > 12 THEN v_period_month := 1; v_period_year := v_period_year + 1; END IF;
  END LOOP;

  -- Guardrail
  SELECT sum(scheduled_amount) INTO v_last FROM fixed_asset_depreciation_schedule WHERE asset_id = v_asset_id;
  IF v_last <> v_depreciable THEN
    RAISE EXCEPTION 'Schedule sum %.2f != depreciable %.2f', v_last, v_depreciable;
  END IF;

  RETURN v_asset_id;
END $$;
REVOKE ALL ON FUNCTION public.capitalize_bill_allocation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.capitalize_bill_allocation(uuid) TO authenticated;
