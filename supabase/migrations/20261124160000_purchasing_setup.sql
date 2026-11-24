-- Purchasing setup for every client: each product category (group + category) posts to one account, or to an
-- account per venue. An approved invoice with a line that cannot post (not linked to a product, no group, no
-- account) is held with the reason instead of being skipped silently. Invoices already in the books never change.

CREATE TABLE IF NOT EXISTS public.purchase_posting_holds (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  reasons text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, invoice_id)
);
ALTER TABLE public.purchase_posting_holds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchase posting holds readable" ON public.purchase_posting_holds;
CREATE POLICY "purchase posting holds readable" ON public.purchase_posting_holds FOR SELECT
  USING (public.is_platform_admin() OR public.access_level(tenant_id, 'purchasing') >= 1 OR public.access_level(tenant_id, 'finance') >= 1);

CREATE TABLE IF NOT EXISTS public.purchasing_setup_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  rows jsonb NOT NULL,
  note text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, version_no)
);
ALTER TABLE public.purchasing_setup_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "purchasing setup versions readable" ON public.purchasing_setup_versions;
CREATE POLICY "purchasing setup versions readable" ON public.purchasing_setup_versions FOR SELECT
  USING (public.is_platform_admin() OR public.access_level(tenant_id, 'purchasing') >= 1 OR public.access_level(tenant_id, 'finance') >= 1);

-- An account for one venue's category.
DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint WHERE conname = 'account_mapping_rules_rule_type_check' AND conrelid = 'public.account_mapping_rules'::regclass;
  IF d IS NOT NULL AND position('procurement_category_venue' IN d) = 0 THEN
    ALTER TABLE public.account_mapping_rules DROP CONSTRAINT account_mapping_rules_rule_type_check;
    EXECUTE 'ALTER TABLE public.account_mapping_rules ADD CONSTRAINT account_mapping_rules_rule_type_check ' ||
      replace(d, '''procurement_category''::text,', '''procurement_category''::text, ''procurement_category_venue''::text,');
  END IF;
END
$do$;

-- Why an approved invoice cannot post: one reason per line that has no product, no group or no account.
CREATE OR REPLACE FUNCTION public._hold_purchase_invoice(p_tenant uuid, p_invoice uuid, p_venue text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO public.purchase_posting_holds (tenant_id, invoice_id, reasons, updated_at)
  SELECT p_tenant, p_invoice, coalesce((array_agg(DISTINCT x.r ORDER BY x.r))[1:10], '{}'), now()
    FROM (
      SELECT coalesce(nullif(btrim(li.description), ''), 'A line') ||
             CASE WHEN pm.id IS NULL THEN ' is not linked to a product'
                  WHEN coalesce(pm.financial_treatment, '') = '' THEN ' has no group'
                  ELSE ' has no account' END AS r
        FROM public.invoice_line_items li
        LEFT JOIN public.product_master pm ON pm.id = li.product_master_id AND pm.tenant_id = p_tenant
        LEFT JOIN LATERAL (SELECT r.account_id FROM public.account_mapping_rules r WHERE r.tenant_id = p_tenant AND (
            (r.rule_type = 'procurement_category_venue' AND r.match_key = COALESCE(pm.financial_treatment,'')||'__'||COALESCE(pm.level1_category,'')||'__'||COALESCE(p_venue,''))
            OR (r.rule_type = 'procurement_category' AND r.match_key = COALESCE(pm.financial_treatment,'')||'__'||COALESCE(pm.level1_category,'')))
          ORDER BY (r.rule_type = 'procurement_category_venue') DESC LIMIT 1) amr ON true
       WHERE li.tenant_id = p_tenant AND li.invoice_id = p_invoice
         AND (pm.id IS NULL OR coalesce(pm.financial_treatment, '') = '' OR COALESCE(pm.default_coa_account_id, amr.account_id) IS NULL)
    ) x
  ON CONFLICT (tenant_id, invoice_id) DO UPDATE SET reasons = EXCLUDED.reasons, updated_at = now();
$function$;
REVOKE ALL ON FUNCTION public._hold_purchase_invoice(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- Save the purchasing setup (Bani, or a role with Approve on Finance).
-- p_rows: [{treatment, category, new_treatment?, account_id?, venue_accounts?: {venue_id: account_id}}]
CREATE OR REPLACE FUNCTION public.save_purchasing_setup(p_tenant uuid, p_rows jsonb, p_note text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  x jsonb; v_ft text; v_from text; v_cat text; v_key text; v_acct uuid; v_va jsonb; k text; val text; v_no int; v_venue text;
BEGIN
  IF NOT (public.is_platform_admin() OR public.access_level(p_tenant, 'finance') >= 3) THEN
    RAISE EXCEPTION 'You do not have permission to change the purchasing setup'; END IF;
  IF p_tenant IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant) THEN RAISE EXCEPTION 'Unknown client'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) = 0 THEN RAISE EXCEPTION 'Nothing to save'; END IF;
  IF jsonb_array_length(p_rows) > 300 THEN RAISE EXCEPTION 'Too many categories'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('purchasing_setup:' || p_tenant::text));

  FOR x IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_from := coalesce(x->>'treatment', '');
    v_cat := coalesce(x->>'category', '');
    v_ft := coalesce(nullif(x->>'new_treatment', ''), v_from);
    IF v_ft <> '' AND v_ft NOT IN ('COGS','OpEx','Asset - Supplier Deposit','Asset - Fixed Asset','Asset - Prepayment','Asset - Other') THEN
      RAISE EXCEPTION 'Unknown group for %', coalesce(nullif(v_cat, ''), 'a category'); END IF;
    v_acct := nullif(x->>'account_id', '')::uuid;
    v_va := CASE WHEN jsonb_typeof(x->'venue_accounts') = 'object' THEN x->'venue_accounts' ELSE '{}'::jsonb END;
    IF v_acct IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE id = v_acct AND tenant_id = p_tenant) THEN
      RAISE EXCEPTION 'Unknown account for %', v_cat; END IF;
    -- A category with no group takes the group chosen here (products in it that have no group yet).
    IF v_from = '' AND v_ft <> '' THEN
      UPDATE public.product_master SET financial_treatment = v_ft
       WHERE tenant_id = p_tenant AND coalesce(level1_category, '') = v_cat AND coalesce(financial_treatment, '') = '';
    END IF;
    IF v_ft = '' THEN CONTINUE; END IF;
    v_key := v_ft || '__' || v_cat;
    IF v_acct IS NULL THEN
      DELETE FROM public.account_mapping_rules WHERE tenant_id = p_tenant AND rule_type = 'procurement_category' AND match_key = v_key;
    ELSE
      INSERT INTO public.account_mapping_rules (tenant_id, rule_type, match_key, account_id) VALUES (p_tenant, 'procurement_category', v_key, v_acct)
      ON CONFLICT (tenant_id, rule_type, match_key) DO UPDATE SET account_id = EXCLUDED.account_id, updated_at = now();
    END IF;
    DELETE FROM public.account_mapping_rules
     WHERE tenant_id = p_tenant AND rule_type = 'procurement_category_venue' AND left(match_key, length(v_key) + 2) = v_key || '__';
    FOR k, val IN SELECT key, value #>> '{}' FROM jsonb_each(v_va) LOOP
      SELECT name INTO v_venue FROM public.venues WHERE id::text = k AND tenant_id = p_tenant;
      IF v_venue IS NULL THEN RAISE EXCEPTION 'Unknown venue for %', v_cat; END IF;
      CONTINUE WHEN val IS NULL OR val = '';
      IF NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE id::text = val AND tenant_id = p_tenant) THEN RAISE EXCEPTION 'Unknown account for % at %', v_cat, v_venue; END IF;
      INSERT INTO public.account_mapping_rules (tenant_id, rule_type, match_key, account_id) VALUES (p_tenant, 'procurement_category_venue', v_key || '__' || v_venue, val::uuid)
      ON CONFLICT (tenant_id, rule_type, match_key) DO UPDATE SET account_id = EXCLUDED.account_id, updated_at = now();
    END LOOP;
  END LOOP;

  SELECT coalesce(max(version_no), 0) + 1 INTO v_no FROM public.purchasing_setup_versions WHERE tenant_id = p_tenant;
  INSERT INTO public.purchasing_setup_versions (tenant_id, version_no, rows, note, created_by, created_by_name)
  VALUES (p_tenant, v_no, p_rows, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), (SELECT display_name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1));
  INSERT INTO public.audit_log (tenant_id, user_id, action, entity_type, entity_id, details)
  VALUES (p_tenant, auth.uid(), 'purchasing_setup_saved', 'purchasing_setup_versions', v_no::text,
          jsonb_build_object('title', 'Purchasing setup version ' || v_no, 'categories', jsonb_array_length(p_rows)));
  INSERT INTO public.pending_rebuilds (tenant_id, requested_at, last_source) VALUES (p_tenant, now(), 'purchasing_setup_versions')
  ON CONFLICT (tenant_id) DO UPDATE SET requested_at = now(), last_source = 'purchasing_setup_versions';
  RETURN v_no;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_purchasing_setup(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_purchasing_setup(uuid, jsonb, text) TO authenticated;

-- The journal rebuild: a venue's own account first, then the category's; unpostable invoices are held with reasons.
DO $do$
DECLARE d text; n text; j_old text; j_new text;
BEGIN
  d := pg_get_functiondef('public._rebuild_journal_from_operations_impl'::regproc);
  IF position('_hold_purchase_invoice' IN d) = 0 THEN
    j_old := 'LEFT JOIN public.account_mapping_rules amr ON amr.tenant_id=p_tenant_id AND amr.rule_type=''procurement_category'' AND amr.match_key=COALESCE(pm.financial_treatment,'''')||''__''||COALESCE(pm.level1_category,'''')';
    j_new := 'LEFT JOIN LATERAL (SELECT pmr.account_id FROM public.account_mapping_rules pmr WHERE pmr.tenant_id=p_tenant_id AND ((pmr.rule_type=''procurement_category_venue'' AND pmr.match_key=COALESCE(pm.financial_treatment,'''')||''__''||COALESCE(pm.level1_category,'''')||''__''||COALESCE(inv.venue,'''')) OR (pmr.rule_type=''procurement_category'' AND pmr.match_key=COALESCE(pm.financial_treatment,'''')||''__''||COALESCE(pm.level1_category,''''))) ORDER BY (pmr.rule_type=''procurement_category_venue'') DESC LIMIT 1) amr ON true';
    IF (length(d) - length(replace(d, j_old, ''))) / length(j_old) <> 2 THEN RAISE EXCEPTION 'Journal rebuild: category account lookups not found'; END IF;
    n := replace(d, j_old, j_new);
    n := replace(n, 'IF v_inv_unmapped > 0 THEN CONTINUE; END IF;',
      'IF v_inv_unmapped > 0 THEN PERFORM public._hold_purchase_invoice(p_tenant_id, inv.id, inv.venue); CONTINUE; END IF;
      DELETE FROM public.purchase_posting_holds WHERE tenant_id = p_tenant_id AND invoice_id = inv.id;');
    n := replace(n, '  cnt := cnt + public._post_line_mode_sales(p_tenant_id);',
      '  cnt := cnt + public._post_line_mode_sales(p_tenant_id);
  IF coalesce(current_setting(''bani.accounting.source_type'', true), '''') = '''' THEN DELETE FROM public.purchase_posting_holds WHERE tenant_id = p_tenant_id; END IF;');
    IF position('_hold_purchase_invoice' IN n) = 0 OR position('DELETE FROM public.purchase_posting_holds WHERE tenant_id = p_tenant_id; END IF;' IN n) = 0 THEN
      RAISE EXCEPTION 'Journal rebuild: an insert point was not found'; END IF;
    EXECUTE n;
  END IF;
END
$do$;
