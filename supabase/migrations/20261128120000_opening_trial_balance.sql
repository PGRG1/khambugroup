-- Opening trial balance, the ERP way: one balance per account at the day before the books start,
-- saved as a draft, then posted as one opening journal (source_type 'opening'). Any difference
-- goes to Opening Balance Equity. Supplier / customer / deposit openings stay the detail behind
-- Payables, Receivables and Supplier Deposits and are checked against those lines, never posted twice.

-- Writes only through the functions below (approvers: Bani, business admin, Approve on Finance).
DROP POLICY IF EXISTS "aob write" ON public.account_opening_balances;
REVOKE INSERT, UPDATE, DELETE ON public.account_opening_balances FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public._opening_equity_account(p_tenant uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acc uuid; c text;
BEGIN
  SELECT id INTO acc FROM chart_of_accounts WHERE tenant_id = p_tenant AND is_active AND account_type = 'equity'
    AND (lower(name) = 'opening balance equity' OR code = '3200') ORDER BY (lower(name) = 'opening balance equity') DESC LIMIT 1;
  IF acc IS NOT NULL THEN RETURN acc; END IF;
  c := '3200';
  WHILE EXISTS (SELECT 1 FROM chart_of_accounts WHERE tenant_id = p_tenant AND code = c) LOOP c := (c::int + 1)::text; END LOOP;
  INSERT INTO chart_of_accounts (tenant_id, code, name, account_type, normal_side, is_active, is_cash, sort_order)
  VALUES (p_tenant, c, 'Opening Balance Equity', 'equity', 'credit', true, false, 3200) RETURNING id INTO acc;
  RETURN acc;
END $$;
REVOKE ALL ON FUNCTION public._opening_equity_account(uuid) FROM PUBLIC, anon, authenticated;

-- Replace the draft trial balance for one company. p_rows: [{account_id, debit, credit}]
CREATE OR REPLACE FUNCTION public.save_opening_balances(p_tenant uuid, p_org uuid, p_as_at date, p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.can_edit_account_rules(p_tenant) THEN RAISE EXCEPTION 'Only an approver can change opening balances'; END IF;
  IF p_as_at IS NULL THEN RAISE EXCEPTION 'Pick the as-at date'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_org AND tenant_id = p_tenant) THEN RAISE EXCEPTION 'Company not found'; END IF;
  IF EXISTS (SELECT 1 FROM account_opening_balances WHERE tenant_id = p_tenant AND organization_id = p_org AND status = 'posted') THEN
    RAISE EXCEPTION 'Opening balances are posted. Undo the posting first';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_rows,'[]')) r
             WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts a WHERE a.id = (r->>'account_id')::uuid AND a.tenant_id = p_tenant)
                OR coalesce((r->>'debit')::numeric,0) < 0 OR coalesce((r->>'credit')::numeric,0) < 0) THEN
    RAISE EXCEPTION 'An account or amount is not valid';
  END IF;
  DELETE FROM account_opening_balances WHERE tenant_id = p_tenant AND organization_id = p_org;
  INSERT INTO account_opening_balances (tenant_id, organization_id, coa_account_id, as_at_date, debit, credit, status, created_by)
  SELECT p_tenant, p_org, (r->>'account_id')::uuid, p_as_at,
         round(sum(coalesce((r->>'debit')::numeric,0)),2), round(sum(coalesce((r->>'credit')::numeric,0)),2), 'draft', auth.uid()
  FROM jsonb_array_elements(coalesce(p_rows,'[]')) r
  GROUP BY (r->>'account_id')::uuid
  HAVING round(sum(coalesce((r->>'debit')::numeric,0)),2) <> 0 OR round(sum(coalesce((r->>'credit')::numeric,0)),2) <> 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Post the draft as one opening journal on the as-at date.
CREATE OR REPLACE FUNCTION public.post_opening_balances(p_tenant uuid, p_org uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d date; nd integer; dr numeric; cr numeric; eq uuid; j uuid; org_name text;
BEGIN
  IF NOT public.can_edit_account_rules(p_tenant) THEN RAISE EXCEPTION 'Only an approver can post opening balances'; END IF;
  SELECT name INTO org_name FROM organizations WHERE id = p_org AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;
  PERFORM 1 FROM account_opening_balances WHERE tenant_id = p_tenant AND organization_id = p_org FOR UPDATE;
  IF EXISTS (SELECT 1 FROM account_opening_balances WHERE tenant_id = p_tenant AND organization_id = p_org AND status = 'posted') THEN
    RAISE EXCEPTION 'Opening balances are already posted';
  END IF;
  SELECT count(DISTINCT as_at_date), min(as_at_date), coalesce(sum(debit),0), coalesce(sum(credit),0) INTO nd, d, dr, cr
    FROM account_opening_balances WHERE tenant_id = p_tenant AND organization_id = p_org;
  IF d IS NULL THEN RAISE EXCEPTION 'Nothing to post yet'; END IF;
  IF nd > 1 THEN RAISE EXCEPTION 'Opening balances have more than one date'; END IF;
  IF dr = 0 AND cr = 0 THEN RAISE EXCEPTION 'Nothing to post yet'; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE tenant_id = p_tenant AND source_type = 'opening' AND source_id = p_org::text AND status = 'posted') THEN
    RAISE EXCEPTION 'An opening journal already exists for this company';
  END IF;
  eq := public._opening_equity_account(p_tenant);
  INSERT INTO journal_entries (tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by)
  VALUES (p_tenant, d, 'Opening balances · '||org_name, 'opening', p_org::text, 'posted', now(), auth.uid()) RETURNING id INTO j;
  INSERT INTO journal_lines (tenant_id, entry_id, account_id, debit, credit, line_no, memo)
  SELECT p_tenant, j, x.acc, x.debit, x.credit, row_number() OVER (ORDER BY x.ord, x.code), x.memo FROM (
    SELECT o.coa_account_id acc, greatest(o.debit - o.credit,0) debit, greatest(o.credit - o.debit,0) credit, 0 ord, a.code, 'Opening balance' memo
      FROM account_opening_balances o JOIN chart_of_accounts a ON a.id = o.coa_account_id
     WHERE o.tenant_id = p_tenant AND o.organization_id = p_org AND o.debit <> o.credit
    UNION ALL
    SELECT eq, greatest(cr - dr,0), greatest(dr - cr,0), 1, '', 'Opening difference' WHERE round(dr - cr,2) <> 0
  ) x;
  UPDATE account_opening_balances SET status = 'posted', posted_journal_id = j WHERE tenant_id = p_tenant AND organization_id = p_org;
  RETURN j;
END $$;

-- Undo: removes the opening journal (only while its month is open) and returns the rows to draft.
CREATE OR REPLACE FUNCTION public.unpost_opening_balances(p_tenant uuid, p_org uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j uuid;
BEGIN
  IF NOT public.can_edit_account_rules(p_tenant) THEN RAISE EXCEPTION 'Only an approver can undo opening balances'; END IF;
  SELECT posted_journal_id INTO j FROM account_opening_balances WHERE tenant_id = p_tenant AND organization_id = p_org AND status = 'posted' LIMIT 1;
  IF j IS NULL THEN RAISE EXCEPTION 'Opening balances are not posted'; END IF;
  DELETE FROM journal_lines WHERE entry_id = j AND tenant_id = p_tenant;
  DELETE FROM journal_entries WHERE id = j AND tenant_id = p_tenant AND source_type = 'opening';
  UPDATE account_opening_balances SET status = 'draft', posted_journal_id = NULL WHERE tenant_id = p_tenant AND organization_id = p_org;
END $$;

REVOKE ALL ON FUNCTION public.save_opening_balances(uuid,uuid,date,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_opening_balances(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unpost_opening_balances(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_opening_balances(uuid,uuid,date,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_opening_balances(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpost_opening_balances(uuid,uuid) TO authenticated;

-- The setup wizard's save must not change balances that are already in the books.
CREATE OR REPLACE FUNCTION public.platform_upsert_account_opening_balances(_tenant_id uuid, _rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _count integer;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'not_authorized: platform admin required'; END IF;
  IF EXISTS (SELECT 1 FROM account_opening_balances WHERE tenant_id = _tenant_id AND status = 'posted') THEN
    RAISE EXCEPTION 'Opening balances are posted. Undo the posting first';
  END IF;
  INSERT INTO public.account_opening_balances (tenant_id, organization_id, coa_account_id, as_at_date, debit, credit, status)
  SELECT _tenant_id, (r->>'organization_id')::uuid, (r->>'coa_account_id')::uuid, (r->>'as_at_date')::date,
         coalesce((r->>'debit')::numeric, 0), coalesce((r->>'credit')::numeric, 0), 'draft'
  FROM jsonb_array_elements(_rows) AS r
  WHERE EXISTS (SELECT 1 FROM organizations o WHERE o.id = (r->>'organization_id')::uuid AND o.tenant_id = _tenant_id)
    AND EXISTS (SELECT 1 FROM chart_of_accounts a WHERE a.id = (r->>'coa_account_id')::uuid AND a.tenant_id = _tenant_id)
  ON CONFLICT (tenant_id, organization_id, coa_account_id, as_at_date)
  DO UPDATE SET debit = EXCLUDED.debit, credit = EXCLUDED.credit, status = 'draft';
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END $$;
