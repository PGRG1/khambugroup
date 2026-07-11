
-- Platform-admin-scoped RPCs for the onboarding cockpit.
-- These bypass tenant-scoped RLS on writes (safely) by verifying is_platform_admin()
-- and performing the operation with the target tenant_id from the URL.

-- 1. Organizations upsert / delete
CREATE OR REPLACE FUNCTION public.platform_upsert_organization(
  _tenant_id uuid,
  _id uuid,
  _name text,
  _legal_name text DEFAULT NULL,
  _registration_number text DEFAULT NULL,
  _incorporation_date date DEFAULT NULL,
  _registered_address text DEFAULT NULL,
  _auditor text DEFAULT NULL,
  _industry text DEFAULT NULL
) RETURNS public.organizations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.organizations;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized: platform admin required';
  END IF;
  IF _name IS NULL OR btrim(_name) = '' THEN
    RAISE EXCEPTION 'name_required';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.organizations(tenant_id, name, legal_name, registration_number, incorporation_date, registered_address, auditor, industry)
    VALUES (_tenant_id, _name, _legal_name, _registration_number, _incorporation_date, _registered_address, _auditor, _industry)
    RETURNING * INTO r;
  ELSE
    UPDATE public.organizations
       SET name=_name, legal_name=_legal_name, registration_number=_registration_number,
           incorporation_date=_incorporation_date, registered_address=_registered_address,
           auditor=_auditor, industry=_industry
     WHERE id=_id AND tenant_id=_tenant_id
    RETURNING * INTO r;
    IF r.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.platform_delete_organization(_tenant_id uuid, _id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized: platform admin required';
  END IF;
  DELETE FROM public.organizations WHERE id=_id AND tenant_id=_tenant_id;
END $$;

-- 2. Venues upsert
CREATE OR REPLACE FUNCTION public.platform_upsert_venue(
  _tenant_id uuid,
  _id uuid,
  _name text,
  _organization_id uuid
) RETURNS public.venues
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.venues; _sort integer;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized: platform admin required';
  END IF;
  IF _name IS NULL OR btrim(_name) = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF _organization_id IS NULL THEN RAISE EXCEPTION 'organization_required'; END IF;
  IF _id IS NULL THEN
    SELECT coalesce(max(sort_order),0)+1 INTO _sort FROM public.venues WHERE tenant_id=_tenant_id;
    INSERT INTO public.venues(tenant_id, name, organization_id, is_active, sort_order)
    VALUES (_tenant_id, _name, _organization_id, true, _sort)
    RETURNING * INTO r;
  ELSE
    UPDATE public.venues
       SET name=_name, organization_id=_organization_id
     WHERE id=_id AND tenant_id=_tenant_id
    RETURNING * INTO r;
    IF r.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  END IF;
  RETURN r;
END $$;

-- 3. Tenant localisation update
CREATE OR REPLACE FUNCTION public.platform_update_tenant_localisation(
  _tenant_id uuid,
  _timezone text,
  _base_currency text,
  _country text,
  _financial_year_end date,
  _financial_year_start_year integer
) RETURNS public.tenants
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.tenants;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized: platform admin required';
  END IF;
  UPDATE public.tenants
     SET timezone = coalesce(_timezone, timezone),
         base_currency = coalesce(_base_currency, base_currency),
         country = coalesce(_country, country),
         financial_year_end = _financial_year_end,
         financial_year_start_year = _financial_year_start_year
   WHERE id = _tenant_id
  RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN r;
END $$;

-- 4. Account opening balances bulk upsert (accepts a jsonb array of rows)
CREATE OR REPLACE FUNCTION public.platform_upsert_account_opening_balances(
  _tenant_id uuid,
  _rows jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _count integer;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized: platform admin required';
  END IF;
  INSERT INTO public.account_opening_balances
    (tenant_id, organization_id, coa_account_id, as_at_date, debit, credit, status)
  SELECT
    _tenant_id,
    (r->>'organization_id')::uuid,
    (r->>'coa_account_id')::uuid,
    (r->>'as_at_date')::date,
    coalesce((r->>'debit')::numeric, 0),
    coalesce((r->>'credit')::numeric, 0),
    coalesce(r->>'status','draft')
  FROM jsonb_array_elements(_rows) AS r
  ON CONFLICT (tenant_id, organization_id, coa_account_id, as_at_date)
  DO UPDATE SET debit = EXCLUDED.debit, credit = EXCLUDED.credit, status = EXCLUDED.status;
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END $$;

-- 5. Chart of accounts template loader
CREATE OR REPLACE FUNCTION public.platform_load_coa_template(
  _tenant_id uuid,
  _template_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tpl jsonb; _count integer;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized: platform admin required';
  END IF;
  SELECT template INTO _tpl FROM public.coa_templates WHERE id = _template_id AND is_active = true;
  IF _tpl IS NULL THEN RAISE EXCEPTION 'template_not_found'; END IF;
  INSERT INTO public.chart_of_accounts
    (tenant_id, code, name, account_type, normal_side, is_active, is_cash, sort_order)
  SELECT _tenant_id, r->>'code', r->>'name', r->>'account_type', r->>'normal_side',
         true, coalesce((r->>'is_cash')::boolean, false), coalesce((r->>'sort_order')::int, 0)
  FROM jsonb_array_elements(_tpl) AS r
  ON CONFLICT (tenant_id, code) DO NOTHING;
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END $$;

GRANT EXECUTE ON FUNCTION public.platform_upsert_organization(uuid,uuid,text,text,text,date,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_delete_organization(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_upsert_venue(uuid,uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_update_tenant_localisation(uuid,text,text,text,date,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_upsert_account_opening_balances(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_load_coa_template(uuid,uuid) TO authenticated;
