-- Paid by someone else: a supplier invoice or bill paid by staff, the director, a group company or another person.
-- The supplier is settled by that payment (Dr Accounts Payable) and the business now owes the person who paid
-- (Cr their liability account). What is owed shows in Payables and is repaid like any other payable.

-- Who paid, on the payment itself. Paid by someone else never has a bank account.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS paid_by_kind text, ADD COLUMN IF NOT EXISTS paid_by_name text;
ALTER TABLE public.expense_bill_payments ADD COLUMN IF NOT EXISTS paid_by_kind text, ADD COLUMN IF NOT EXISTS paid_by_name text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_paid_by_check') THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_paid_by_check CHECK (paid_by_kind IS NULL OR (paid_by_kind IN ('staff','director','group_company','other') AND length(btrim(coalesce(paid_by_name,''))) BETWEEN 1 AND 120 AND paid_from_account_id IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_bill_payments_paid_by_check') THEN
    ALTER TABLE public.expense_bill_payments ADD CONSTRAINT expense_bill_payments_paid_by_check CHECK (paid_by_kind IS NULL OR (paid_by_kind IN ('staff','director','group_company','other') AND length(btrim(coalesce(paid_by_name,''))) BETWEEN 1 AND 120 AND bank_account_id IS NULL));
  END IF;
END $$;

-- What the business owes the person who paid, one row per payment; repayments below.
CREATE TABLE IF NOT EXISTS public.owed_to_others (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('staff','director','group_company','other')),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0 AND paid_amount <= amount),
  status text NOT NULL DEFAULT 'owing' CHECK (status IN ('owing','paid')),
  owed_date date NOT NULL,
  description text,
  source_type text NOT NULL CHECK (source_type IN ('invoice_payment','bill_payment')),
  source_id uuid NOT NULL,
  journal_entry_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id)
);
CREATE TABLE IF NOT EXISTS public.owed_to_others_repayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owed_id uuid NOT NULL REFERENCES public.owed_to_others(id) ON DELETE CASCADE,
  payment_date date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL,
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  reference text,
  journal_entry_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS owed_to_others_tenant_idx ON public.owed_to_others (tenant_id, status);
CREATE INDEX IF NOT EXISTS owed_to_others_repayments_owed_idx ON public.owed_to_others_repayments (owed_id);
ALTER TABLE public.owed_to_others ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owed_to_others_repayments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owed_to_others, public.owed_to_others_repayments FROM anon, authenticated;
DROP POLICY IF EXISTS owed_to_others_read ON public.owed_to_others;
CREATE POLICY owed_to_others_read ON public.owed_to_others FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(), tenant_id));
DROP POLICY IF EXISTS owed_to_others_repayments_read ON public.owed_to_others_repayments;
CREATE POLICY owed_to_others_repayments_read ON public.owed_to_others_repayments FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(), tenant_id));
GRANT SELECT ON public.owed_to_others, public.owed_to_others_repayments TO authenticated;
-- Rows are written only by the payment functions below (SECURITY DEFINER), never directly.

-- Repayments post with their own journal source.
DO $$ DECLARE d text; BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint WHERE conname = 'journal_entries_source_type_check' AND conrelid = 'public.journal_entries'::regclass;
  IF d IS NOT NULL AND position('owed_to_other_repayment' in d) = 0 THEN
    ALTER TABLE public.journal_entries DROP CONSTRAINT journal_entries_source_type_check;
    EXECUTE 'ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check ' || replace(d, '::text])', '::text, ''owed_to_other_repayment''::text])');
  END IF;
END $$;

-- The client's Accounts Payable account: the mapping, else the account bills post to (code 2000 or the AP name).
CREATE OR REPLACE FUNCTION public._payables_account(p_tenant uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT account_id FROM account_mapping_rules WHERE tenant_id = p_tenant AND rule_type = 'accounts_payable' LIMIT 1),
    (SELECT id FROM chart_of_accounts WHERE tenant_id = p_tenant AND (code = '2000' OR lower(name) LIKE '%accounts payable%') ORDER BY code LIMIT 1));
$$;
REVOKE ALL ON FUNCTION public._payables_account(uuid) FROM PUBLIC, anon, authenticated;

-- The account that holds what is owed to whoever paid; added from the Bani master (with a free code) if the client has none.
CREATE OR REPLACE FUNCTION public._paid_by_account(p_tenant uuid, p_kind text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acc uuid; want text; want_code text; grp text := 'Current liabilities'; c int;
BEGIN
  IF p_kind = 'staff' THEN
    SELECT id INTO acc FROM chart_of_accounts WHERE tenant_id = p_tenant AND is_active AND account_type = 'liability' AND name ILIKE 'Staff Reimbursements Payable' ORDER BY code LIMIT 1;
    IF acc IS NOT NULL THEN RETURN acc; END IF;
    want := 'Other Payables'; want_code := '2140';
  ELSIF p_kind = 'director' THEN
    SELECT id INTO acc FROM chart_of_accounts WHERE tenant_id = p_tenant AND is_active AND account_type = 'liability' AND (name ILIKE 'Director%' OR name ILIKE '%shareholder loan%') ORDER BY code LIMIT 1;
    IF acc IS NOT NULL THEN RETURN acc; END IF;
    want := 'Director / Shareholder Loan'; want_code := '2450'; grp := 'Non-current liabilities';
  ELSIF p_kind = 'group_company' THEN
    SELECT id INTO acc FROM chart_of_accounts WHERE tenant_id = p_tenant AND is_active AND account_type = 'liability' AND name ILIKE 'Due to Related%' ORDER BY code LIMIT 1;
    IF acc IS NOT NULL THEN RETURN acc; END IF;
    want := 'Due to Related Companies'; want_code := '2160';
  ELSIF p_kind = 'other' THEN
    want := 'Other Payables'; want_code := '2140';
  ELSE RAISE EXCEPTION 'Pick who paid';
  END IF;
  SELECT id INTO acc FROM chart_of_accounts WHERE tenant_id = p_tenant AND is_active AND account_type = 'liability' AND name ILIKE want ORDER BY code LIMIT 1;
  IF acc IS NOT NULL THEN RETURN acc; END IF;
  -- Not in this client's chart yet: add it, on the master code when free, else the next free code after it.
  c := want_code::int;
  WHILE EXISTS (SELECT 1 FROM chart_of_accounts WHERE tenant_id = p_tenant AND code = c::text) LOOP c := c + 1; END LOOP;
  INSERT INTO chart_of_accounts (tenant_id, code, name, account_type, normal_side, is_active, is_cash, sort_order, is_system, statement_group)
  VALUES (p_tenant, c::text, want, 'liability', 'credit', true, false, c, false, grp) RETURNING id INTO acc;
  RETURN acc;
END $$;
REVOKE ALL ON FUNCTION public._paid_by_account(uuid, text) FROM PUBLIC, anon, authenticated;

-- Records what is owed to the person who paid, once per payment.
CREATE OR REPLACE FUNCTION public._record_owed_to_other(p_tenant uuid, p_kind text, p_name text, p_account uuid, p_amount numeric, p_date date, p_what text, p_source text, p_source_id uuid, p_entry uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO owed_to_others (tenant_id, kind, name, account_id, amount, owed_date, description, source_type, source_id, journal_entry_id, created_by)
  VALUES (p_tenant, p_kind, btrim(p_name), p_account, p_amount, p_date, p_what, p_source, p_source_id, p_entry, auth.uid())
  ON CONFLICT (source_type, source_id) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public._record_owed_to_other(uuid, text, text, uuid, numeric, date, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Repays what is owed to a person: Dr their account, Cr bank or cash, and marks it paid. Called by finance_record_owed_payment.
CREATE OR REPLACE FUNCTION public._repay_owed_to_other(p_tenant uuid, p_owed uuid, p_date date, p_amount numeric, p_method text, p_account uuid, p_reference text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); o owed_to_others; acc uuid; bank bank_accounts; j uuid;
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin') OR NOT (public.user_has_tenant(uid, p_tenant) OR public.is_super_admin(uid)) THEN RAISE EXCEPTION 'Finance access required'; END IF;
  SELECT * INTO o FROM owed_to_others WHERE id = p_owed AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR o.status <> 'owing' THEN RAISE EXCEPTION 'Nothing owed on this item'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > o.amount - o.paid_amount + 0.005 THEN RAISE EXCEPTION 'Amount is more than is owed'; END IF;
  IF p_method = 'cash' THEN
    acc := coalesce((SELECT account_id FROM account_mapping_rules WHERE tenant_id = p_tenant AND rule_type = 'cash_payment_clearing' LIMIT 1),
                    (SELECT account_id FROM account_mapping_rules WHERE tenant_id = p_tenant AND rule_type = 'payment_method_cash' AND coalesce(btrim(match_key),'') IN ('','cash') ORDER BY match_key DESC LIMIT 1));
    IF acc IS NULL THEN RAISE EXCEPTION 'Set up the cash account first'; END IF;
  ELSE
    SELECT * INTO bank FROM bank_accounts WHERE id = p_account AND tenant_id = p_tenant AND is_active;
    IF NOT FOUND OR bank.linked_gl_account_id IS NULL THEN RAISE EXCEPTION 'Choose an account linked to the books'; END IF;
    acc := bank.linked_gl_account_id;
  END IF;
  INSERT INTO journal_entries (tenant_id, entry_date, memo, source_type, source_id, status, posted_at, created_by)
  VALUES (p_tenant, p_date, 'Repaid '||o.name, 'owed_to_other_repayment', o.id, 'posted', now(), uid) RETURNING id INTO j;
  INSERT INTO journal_lines (tenant_id, entry_id, account_id, debit, credit, line_no, memo) VALUES
    (p_tenant, j, o.account_id, p_amount, 0, 1, 'Repaying '||o.name),
    (p_tenant, j, acc, 0, p_amount, 2, CASE WHEN p_method = 'cash' THEN 'Cash' ELSE 'Paid from '||bank.account_name END);
  INSERT INTO owed_to_others_repayments (tenant_id, owed_id, payment_date, amount, payment_method, bank_account_id, reference, journal_entry_id, created_by)
  VALUES (p_tenant, o.id, p_date, p_amount, p_method, CASE WHEN p_method = 'cash' THEN NULL ELSE p_account END, nullif(p_reference,''), j, uid);
  UPDATE owed_to_others SET paid_amount = paid_amount + p_amount, status = CASE WHEN paid_amount + p_amount >= amount - 0.005 THEN 'paid' ELSE 'owing' END WHERE id = o.id;
  RETURN j;
END $$;
REVOKE ALL ON FUNCTION public._repay_owed_to_other(uuid, uuid, date, numeric, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._repay_owed_to_other(uuid, uuid, date, numeric, text, uuid, text) TO authenticated;

-- Edits an existing function's definition; each change must match exactly once.
CREATE OR REPLACE FUNCTION pg_temp.swap(d text, old text, new text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF (length(d) - length(replace(d, old, ''))) / greatest(length(old),1) <> 1 THEN RAISE EXCEPTION 'Expected exactly one match for: %', left(old, 120); END IF;
  RETURN replace(d, old, new);
END $$;

-- Supplier invoice payment: AP from the shared lookup; paid by someone else credits that person's account.
DO $$ DECLARE d text := pg_get_functiondef('public.post_invoice_payment(uuid)'::regprocedure); BEGIN
  d := pg_temp.swap(d, $x$SELECT account_id INTO acc_ap FROM public.account_mapping_rules WHERE tenant_id = v_tenant AND rule_type = 'accounts_payable' LIMIT 1;
  IF acc_ap IS NULL THEN RAISE EXCEPTION 'Missing mapping rule: accounts_payable'; END IF;
  IF p.paid_from_account_id IS NOT NULL THEN$x$, $x$acc_ap := public._payables_account(v_tenant);
  IF acc_ap IS NULL THEN RAISE EXCEPTION 'Missing mapping rule: accounts_payable'; END IF;
  IF p.paid_by_kind IS NOT NULL THEN
    acc_bank := public._paid_by_account(v_tenant, p.paid_by_kind);
  ELSIF p.paid_from_account_id IS NOT NULL THEN$x$);
  d := pg_temp.swap(d, $x$  IF acc_bank IS NULL AND p.payment_method IS NOT NULL THEN$x$, $x$  IF acc_bank IS NULL AND p.payment_method IS NOT NULL AND p.paid_by_kind IS NULL THEN$x$);
  d := pg_temp.swap(d, $x$    VALUES (cash_entry, acc_bank, 0, v_cash_amount, v_ln, COALESCE(p.payment_method,'Bank')||' outflow', v_tenant);$x$,
    $x$    VALUES (cash_entry, acc_bank, 0, v_cash_amount, v_ln, CASE WHEN p.paid_by_kind IS NOT NULL THEN 'Paid by '||p.paid_by_name ELSE COALESCE(p.payment_method,'Bank')||' outflow' END, v_tenant);$x$);
  d := pg_temp.swap(d, $x$    UPDATE public.payments SET journal_entry_id = cash_entry WHERE id = p_payment_id;$x$,
    $x$    UPDATE public.payments SET journal_entry_id = cash_entry WHERE id = p_payment_id;
    IF p.paid_by_kind IS NOT NULL THEN
      PERFORM public._record_owed_to_other(v_tenant, p.paid_by_kind, p.paid_by_name, acc_bank, v_cash_amount, p.payment_date,
        (SELECT name FROM public.suppliers WHERE id = p.supplier_id)||' · '||coalesce((SELECT string_agg(iv2.invoice_number, ', ') FROM public.payment_allocations pa2 JOIN public.invoices iv2 ON iv2.id = pa2.invoice_id WHERE pa2.payment_id = p_payment_id), 'payment'),
        'invoice_payment', p_payment_id, cash_entry);
    END IF;$x$);
  EXECUTE d;
END $$;

-- Bill payment: same, plus the caller must belong to the bill's client.
DO $$ DECLARE d text := pg_get_functiondef('public.post_expense_bill_payment(uuid)'::regprocedure); BEGIN
  d := pg_temp.swap(d, $x$  SELECT * INTO b FROM public.expense_bills WHERE id = p.bill_id;$x$,
    $x$  SELECT * INTO b FROM public.expense_bills WHERE id = p.bill_id;
  IF b.id IS NULL OR b.tenant_id IS DISTINCT FROM p.tenant_id OR NOT (public.user_has_tenant(v_uid, b.tenant_id) OR public.is_platform_admin()) THEN RAISE EXCEPTION 'Not authorized for this bill'; END IF;$x$);
  d := pg_temp.swap(d, $x$  SELECT account_id INTO acc_ap FROM public.account_mapping_rules WHERE rule_type='accounts_payable' AND tenant_id=b.tenant_id LIMIT 1;$x$,
    $x$  acc_ap := public._payables_account(b.tenant_id);$x$);
  d := pg_temp.swap(d, $x$  IF p.payment_method='cash' THEN$x$, $x$  IF p.paid_by_kind IS NOT NULL THEN acc_bank := public._paid_by_account(b.tenant_id, p.paid_by_kind);
  ELSIF p.payment_method='cash' THEN$x$);
  d := pg_temp.swap(d, $x$VALUES (b.tenant_id, e_id, acc_bank, 0, p.amount, b.venue, 2, p.payment_method);$x$,
    $x$VALUES (b.tenant_id, e_id, acc_bank, 0, p.amount, b.venue, 2, CASE WHEN p.paid_by_kind IS NOT NULL THEN 'Paid by '||p.paid_by_name ELSE p.payment_method END);$x$);
  d := pg_temp.swap(d, $x$  UPDATE public.expense_bill_payments SET journal_entry_id = e_id WHERE id = p.id;$x$,
    $x$  UPDATE public.expense_bill_payments SET journal_entry_id = e_id WHERE id = p.id;
  IF p.paid_by_kind IS NOT NULL THEN
    PERFORM public._record_owed_to_other(b.tenant_id, p.paid_by_kind, p.paid_by_name, acc_bank, p.amount, p.payment_date,
      coalesce(b.vendor_name,'Bill')||' · '||coalesce(b.bill_number,'bill'), 'bill_payment', p.id, e_id);
  END IF;$x$);
  EXECUTE d;
END $$;

-- Recording a supplier payment: who paid is kept; the supplier and its invoices must be the caller's client.
DO $$ DECLARE d text := pg_get_functiondef('public.record_payment_with_allocations(jsonb,jsonb)'::regprocedure); BEGIN
  d := pg_temp.swap(d, $x$DECLARE new_id uuid;$x$, $x$DECLARE v_tenant uuid; new_id uuid;$x$);
  d := pg_temp.swap(d, $x$BEGIN
  INSERT INTO public.payments (payment_date, amount, payment_method, paid_from_account_id, reference_number, cheque_number, notes, supplier_id, match_status, created_by, original_amount, currency)$x$,
    $x$BEGIN
  SELECT tenant_id INTO v_tenant FROM public.suppliers WHERE id = NULLIF(p_payment->>'supplier_id','')::uuid;
  IF v_tenant IS NULL OR NOT (public.user_has_tenant(auth.uid(), v_tenant) OR public.is_platform_admin()) THEN RAISE EXCEPTION 'Supplier not available'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_allocations,'[]'::jsonb)) a LEFT JOIN public.invoices i ON i.id = (a->>'invoice_id')::uuid WHERE i.id IS NULL OR i.tenant_id IS DISTINCT FROM v_tenant) THEN RAISE EXCEPTION 'Invoice not available'; END IF;
  INSERT INTO public.payments (tenant_id, paid_by_kind, paid_by_name, payment_date, amount, payment_method, paid_from_account_id, reference_number, cheque_number, notes, supplier_id, match_status, created_by, original_amount, currency)$x$);
  d := pg_temp.swap(d, $x$  VALUES ((p_payment->>'payment_date')::date,$x$, $x$  VALUES (v_tenant, NULLIF(p_payment->>'paid_by_kind',''), NULLIF(btrim(coalesce(p_payment->>'paid_by_name','')),''), (p_payment->>'payment_date')::date,$x$);
  d := pg_temp.swap(d, $x$COALESCE(p_payment->>'match_status', CASE WHEN$x$, $x$COALESCE(p_payment->>'match_status', CASE WHEN NULLIF(p_payment->>'paid_by_kind','') IS NOT NULL THEN 'not_required' WHEN$x$);
  EXECUTE d;
END $$;

-- Paying from Payables: "paid by someone else" for invoices and bills, and repaying what is owed to a person (source 'person').
DO $$ DECLARE d text := pg_get_functiondef('public.finance_record_owed_payment(uuid,date,text,uuid,numeric,text,jsonb)'::regprocedure); BEGIN
  d := pg_temp.swap(d, $x$p_reference text, p_items jsonb)$x$, $x$p_reference text, p_items jsonb, p_paid_by_kind text DEFAULT NULL, p_paid_by_name text DEFAULT NULL)$x$);
  d := pg_temp.swap(d, $x$claim public.staff_reimbursements;$x$, $x$claim public.staff_reimbursements; owed public.owed_to_others;$x$);
  d := pg_temp.swap(d, $x$p_method NOT IN('bank_transfer','cash','cheque')$x$, $x$p_method NOT IN('bank_transfer','cash','cheque','paid_by')$x$);
  d := pg_temp.swap(d, $x$IF length(ref)>500 THEN RAISE EXCEPTION 'Reference too long';END IF;$x$,
    $x$IF length(ref)>500 THEN RAISE EXCEPTION 'Reference too long';END IF;
IF p_method='paid_by' AND (p_paid_by_kind IS NULL OR p_paid_by_kind NOT IN('staff','director','group_company','other') OR length(btrim(coalesce(p_paid_by_name,''))) NOT BETWEEN 1 AND 120 OR p_account IS NOT NULL) THEN RAISE EXCEPTION 'Say who paid';END IF;
IF p_method='paid_by' AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) a WHERE a->>'source' NOT IN('supplier','bill')) THEN RAISE EXCEPTION 'Paid by someone else applies to supplier invoices and bills';END IF;$x$);
  d := pg_temp.swap(d, $x$IF p_amount>0 AND p_method<>'cash' THEN SELECT * INTO bank$x$, $x$IF p_amount>0 AND p_method NOT IN('cash','paid_by') THEN SELECT * INTO bank$x$);
  d := pg_temp.swap(d, $x$ELSE RAISE EXCEPTION 'Unsupported payable';END IF;$x$,
    $x$ELSIF x->>'source'='person' THEN
SELECT * INTO owed FROM public.owed_to_others WHERE id=sid AND tenant_id=p_tenant;
IF NOT FOUND OR owed.status<>'owing' THEN RAISE EXCEPTION 'Nothing owed on this item';END IF;
IF acur<>base THEN RAISE EXCEPTION 'Repay from a % account',base;END IF;
due:=owed.amount-owed.paid_amount;
ELSE RAISE EXCEPTION 'Unsupported payable';END IF;$x$);
  d := pg_temp.swap(d, $x$'payment_method',CASE WHEN g.cash=0 THEN 'Credit Note' WHEN p_method='bank_transfer'$x$, $x$'payment_method',CASE WHEN g.cash=0 THEN 'Credit Note' WHEN p_method='paid_by' THEN 'Paid by someone else' WHEN p_method='bank_transfer'$x$);
  d := pg_temp.swap(d, $x$'match_status',CASE WHEN g.cash=0 THEN 'not_required' ELSE 'awaiting_bank_match' END),allocs,'[]');$x$,
    $x$'match_status',CASE WHEN g.cash=0 OR p_method='paid_by' THEN 'not_required' ELSE 'awaiting_bank_match' END,'paid_by_kind',CASE WHEN p_method='paid_by' AND g.cash>0 THEN p_paid_by_kind END,'paid_by_name',CASE WHEN p_method='paid_by' AND g.cash>0 THEN btrim(p_paid_by_name) END),allocs,'[]');$x$);
  d := pg_temp.swap(d, $x$INSERT INTO public.expense_bill_payments(tenant_id,bill_id,payment_date,amount,payment_method,bank_account_id,reference,created_by,original_amount,currency) VALUES(p_tenant,(x->>'id')::uuid,p_date,(x->>'amount')::numeric,p_method,p_account,ref,uid,$x$,
    $x$INSERT INTO public.expense_bill_payments(tenant_id,bill_id,payment_date,amount,payment_method,bank_account_id,reference,created_by,paid_by_kind,paid_by_name,original_amount,currency) VALUES(p_tenant,(x->>'id')::uuid,p_date,(x->>'amount')::numeric,p_method,p_account,ref,uid,CASE WHEN p_method='paid_by' THEN p_paid_by_kind END,CASE WHEN p_method='paid_by' THEN btrim(p_paid_by_name) END,$x$);
  d := pg_temp.swap(d, $x$PERFORM set_config('finance.fx_difference_account','',true);$x$,
    $x$FOR x IN SELECT value FROM jsonb_array_elements(p_items) WHERE value->>'source'='person' LOOP
PERFORM public._repay_owed_to_other(p_tenant,(x->>'id')::uuid,p_date,(x->>'amount')::numeric,p_method,p_account,ref);
result:=result||jsonb_build_array(jsonb_build_object('source','person','id',x->>'id'));END LOOP;
PERFORM set_config('finance.fx_difference_account','',true);$x$);
  EXECUTE d;
END $$;
DROP FUNCTION IF EXISTS public.finance_record_owed_payment(uuid, date, text, uuid, numeric, text, jsonb);
REVOKE ALL ON FUNCTION public.finance_record_owed_payment(uuid, date, text, uuid, numeric, text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_record_owed_payment(uuid, date, text, uuid, numeric, text, jsonb, text, text) TO authenticated;

-- Chat can propose a payment card (record_payment); Confirm runs finance_record_owed_payment as the user.
DO $$ DECLARE d text; BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint WHERE conname = 'bani_pending_actions_kind_check' AND conrelid = 'public.bani_pending_actions'::regclass;
  IF d IS NOT NULL AND position('record_payment' in d) = 0 THEN
    ALTER TABLE public.bani_pending_actions DROP CONSTRAINT bani_pending_actions_kind_check;
    EXECUTE 'ALTER TABLE public.bani_pending_actions ADD CONSTRAINT bani_pending_actions_kind_check ' || replace(d, '::text])', '::text, ''record_payment''::text])');
  END IF;
END $$;
