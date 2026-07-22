
-- =====================================================================
-- 1) CoA seed for KHAMBU
-- =====================================================================
DO $$
DECLARE
  t_id uuid := '00000000-0000-0000-0000-00000000beef';
  parent_fa uuid;
BEGIN
  SELECT id INTO parent_fa FROM public.chart_of_accounts
    WHERE tenant_id = t_id AND code = '1500';

  INSERT INTO public.chart_of_accounts (tenant_id, code, name, account_type, normal_side, parent_id, sort_order, description)
  VALUES
    (t_id, '1510', 'Furniture & Fixtures',     'asset', 'debit',  parent_fa, 1510, 'Capitalized furniture & fixtures'),
    (t_id, '1520', 'Kitchen Equipment',        'asset', 'debit',  parent_fa, 1520, 'Capitalized kitchen equipment'),
    (t_id, '1530', 'IT Equipment',             'asset', 'debit',  parent_fa, 1530, 'Capitalized IT / computer equipment'),
    (t_id, '1540', 'Leasehold Improvements',   'asset', 'debit',  parent_fa, 1540, 'Capitalized leasehold improvements'),
    (t_id, '1550', 'Accumulated Depreciation', 'asset', 'credit', parent_fa, 1550, 'Contra-asset; credit-normal'),
    (t_id, '6900', 'Depreciation Expense',     'opex',  'debit',  NULL,      6900, 'Monthly depreciation charge'),
    (t_id, '8020', 'Gain/Loss on Asset Disposal', 'other_expense', 'debit', NULL, 8020, 'Realized on asset disposal')
  ON CONFLICT (tenant_id, code) DO NOTHING;
END $$;

-- =====================================================================
-- 2) Journal entry source_type extension
-- =====================================================================
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'sales','sales_summary','invoice','invoice_payment','payroll_accrual','payroll_payment',
    'mpf_payment','settlement_fee','settlement_clearing','bank_fee','bank_txn','manual','adjustment',
    'opening','bank_transaction','expense_bill','petty_cash','petty_cash_replenishment',
    'prepaid_deferral','prepaid_recognition','depreciation','asset_disposal'
  ]));

-- =====================================================================
-- 3) fixed_assets table
-- =====================================================================
CREATE TABLE public.fixed_assets (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-00000000beef'::uuid
                                REFERENCES public.tenants(id) ON DELETE RESTRICT,
  asset_tag                   text,
  name                        text NOT NULL,
  category                    text NOT NULL CHECK (category IN ('furniture_fixtures','kitchen_equipment','it_equipment','leasehold_improvements','other')),
  description                 text,

  purchase_date               date NOT NULL,
  in_service_date             date NOT NULL,
  cost                        numeric(14,2) NOT NULL CHECK (cost > 0),
  salvage_value               numeric(14,2) NOT NULL DEFAULT 0 CHECK (salvage_value >= 0),
  useful_life_months          integer NOT NULL CHECK (useful_life_months > 0),
  method                      text NOT NULL DEFAULT 'straight_line' CHECK (method IN ('straight_line')),

  venue_id                    uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  venue                       text,
  supplier_id                 uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,

  source_bill_id              uuid REFERENCES public.expense_bills(id) ON DELETE SET NULL,
  source_allocation_id        uuid REFERENCES public.expense_bill_allocations(id) ON DELETE SET NULL,

  asset_account_id            uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  accumulated_depr_account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  expense_account_id          uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,

  status                      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','fully_depreciated','disposed')),

  disposal_date               date,
  disposal_proceeds           numeric(14,2),
  disposal_journal_entry_id   uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,

  amount_depreciated          numeric(14,2) NOT NULL DEFAULT 0,
  amount_remaining            numeric(14,2) NOT NULL DEFAULT 0,

  notes                       text,
  created_by                  uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, asset_tag)
);

CREATE INDEX idx_fixed_assets_tenant       ON public.fixed_assets(tenant_id);
CREATE INDEX idx_fixed_assets_bill         ON public.fixed_assets(source_bill_id);
CREATE INDEX idx_fixed_assets_status       ON public.fixed_assets(status);
CREATE INDEX idx_fixed_assets_venue        ON public.fixed_assets(venue_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_assets TO authenticated;
GRANT ALL ON public.fixed_assets TO service_role;
ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY fixed_assets_tenant_select ON public.fixed_assets FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY fixed_assets_tenant_write ON public.fixed_assets FOR ALL TO authenticated
  USING ((is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  WITH CHECK ((is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE TRIGGER fixed_assets_set_updated_at BEFORE UPDATE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 4) fixed_asset_depreciation_schedule table
-- =====================================================================
CREATE TABLE public.fixed_asset_depreciation_schedule (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL DEFAULT '00000000-0000-0000-0000-00000000beef'::uuid
                          REFERENCES public.tenants(id) ON DELETE RESTRICT,
  asset_id              uuid NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  period_year           integer NOT NULL,
  period_month          integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  sequence_no           integer NOT NULL,
  scheduled_amount      numeric(14,2) NOT NULL CHECK (scheduled_amount >= 0),
  posted_amount         numeric(14,2) NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','posted','skipped')),
  journal_entry_id      uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  posted_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, sequence_no)
);
CREATE INDEX idx_fads_tenant ON public.fixed_asset_depreciation_schedule(tenant_id);
CREATE INDEX idx_fads_period ON public.fixed_asset_depreciation_schedule(period_year, period_month);
CREATE INDEX idx_fads_status ON public.fixed_asset_depreciation_schedule(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_asset_depreciation_schedule TO authenticated;
GRANT ALL ON public.fixed_asset_depreciation_schedule TO service_role;
ALTER TABLE public.fixed_asset_depreciation_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY fads_tenant_select ON public.fixed_asset_depreciation_schedule FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY fads_tenant_write ON public.fixed_asset_depreciation_schedule FOR ALL TO authenticated
  USING ((is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  WITH CHECK ((is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE TRIGGER fads_set_updated_at BEFORE UPDATE ON public.fixed_asset_depreciation_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 5) Add capitalize fields to expense_bill_allocations
-- =====================================================================
ALTER TABLE public.expense_bill_allocations
  ADD COLUMN IF NOT EXISTS capitalize           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asset_name           text,
  ADD COLUMN IF NOT EXISTS asset_category       text,
  ADD COLUMN IF NOT EXISTS useful_life_months   integer,
  ADD COLUMN IF NOT EXISTS in_service_date      date,
  ADD COLUMN IF NOT EXISTS salvage_value        numeric(14,2) NOT NULL DEFAULT 0;

-- =====================================================================
-- 6) capitalize_bill_allocation RPC
-- =====================================================================
CREATE OR REPLACE FUNCTION public.capitalize_bill_allocation(p_allocation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF NOT a.capitalize THEN RAISE EXCEPTION 'Allocation % is not flagged capitalize', p_allocation_id; END IF;

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

  -- Resolve accounts
  v_asset_acct := CASE v_category
    WHEN 'furniture_fixtures'     THEN (SELECT id FROM chart_of_accounts WHERE tenant_id=a.tenant_id AND code='1510')
    WHEN 'kitchen_equipment'      THEN (SELECT id FROM chart_of_accounts WHERE tenant_id=a.tenant_id AND code='1520')
    WHEN 'it_equipment'           THEN (SELECT id FROM chart_of_accounts WHERE tenant_id=a.tenant_id AND code='1530')
    WHEN 'leasehold_improvements' THEN (SELECT id FROM chart_of_accounts WHERE tenant_id=a.tenant_id AND code='1540')
    ELSE a.account_id
  END;
  IF v_asset_acct IS NULL THEN RAISE EXCEPTION 'Asset GL account not resolved for category %', v_category; END IF;

  SELECT id INTO v_accum_acct FROM chart_of_accounts WHERE tenant_id=a.tenant_id AND code='1550';
  SELECT id INTO v_expense_acct FROM chart_of_accounts WHERE tenant_id=a.tenant_id AND code='6900';
  IF v_accum_acct IS NULL OR v_expense_acct IS NULL THEN RAISE EXCEPTION 'Depreciation accounts (1550/6900) missing'; END IF;

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

-- =====================================================================
-- 7) preview_depreciation_period
-- =====================================================================
CREATE OR REPLACE FUNCTION public.preview_depreciation_period(p_tenant_id uuid, p_year int, p_month int)
RETURNS TABLE(
  venue text,
  venue_id uuid,
  asset_id uuid,
  asset_name text,
  category text,
  expense_account_id uuid,
  accumulated_depr_account_id uuid,
  scheduled_amount numeric,
  already_posted boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fa.venue, fa.venue_id, fa.id, fa.name, fa.category,
         fa.expense_account_id, fa.accumulated_depr_account_id,
         s.scheduled_amount, s.status = 'posted'
  FROM fixed_asset_depreciation_schedule s
  JOIN fixed_assets fa ON fa.id = s.asset_id
  WHERE s.tenant_id = p_tenant_id
    AND s.period_year = p_year AND s.period_month = p_month
  ORDER BY fa.venue NULLS LAST, fa.name;
$$;

-- =====================================================================
-- 8) post_depreciation_period
-- =====================================================================
CREATE OR REPLACE FUNCTION public.post_depreciation_period(p_tenant_id uuid, p_year int, p_month int)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_date date;
  v_group RECORD;
  v_row RECORD;
  v_entry_id uuid;
  v_line_no int;
  v_total numeric(14,2);
  v_source_id text;
  v_entries uuid[] := ARRAY[]::uuid[];
  v_auth uuid := auth.uid();
BEGIN
  v_entry_date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;

  FOR v_group IN
    SELECT fa.venue, fa.venue_id
    FROM fixed_asset_depreciation_schedule s
    JOIN fixed_assets fa ON fa.id = s.asset_id
    WHERE s.tenant_id = p_tenant_id
      AND s.period_year = p_year AND s.period_month = p_month
      AND s.status = 'pending'
    GROUP BY fa.venue, fa.venue_id
  LOOP
    v_source_id := 'depr:' || p_tenant_id || ':' || p_year || '-' || lpad(p_month::text,2,'0')
                   || ':' || COALESCE(v_group.venue_id::text, 'no-venue');

    SELECT COALESCE(sum(s.scheduled_amount),0) INTO v_total
      FROM fixed_asset_depreciation_schedule s
      JOIN fixed_assets fa ON fa.id = s.asset_id
      WHERE s.tenant_id = p_tenant_id
        AND s.period_year = p_year AND s.period_month = p_month
        AND s.status = 'pending'
        AND fa.venue_id IS NOT DISTINCT FROM v_group.venue_id;
    IF v_total = 0 THEN CONTINUE; END IF;

    INSERT INTO journal_entries (tenant_id, entry_date, memo, source_type, source_id, venue, venue_id, status, created_by, posted_at)
      VALUES (p_tenant_id, v_entry_date,
              'Depreciation ' || to_char(v_entry_date,'YYYY-MM') || COALESCE(' — '||v_group.venue,''),
              'depreciation', v_source_id, v_group.venue, v_group.venue_id, 'posted', v_auth, now())
      RETURNING id INTO v_entry_id;

    v_line_no := 1;
    -- Debit lines: 6900 per asset
    FOR v_row IN
      SELECT s.id AS sched_id, s.scheduled_amount, fa.expense_account_id, fa.name, fa.id AS asset_id
      FROM fixed_asset_depreciation_schedule s
      JOIN fixed_assets fa ON fa.id = s.asset_id
      WHERE s.tenant_id = p_tenant_id
        AND s.period_year = p_year AND s.period_month = p_month
        AND s.status = 'pending'
        AND fa.venue_id IS NOT DISTINCT FROM v_group.venue_id
    LOOP
      INSERT INTO journal_lines (tenant_id, entry_id, account_id, debit, credit, venue, venue_id, memo, line_no)
        VALUES (p_tenant_id, v_entry_id, v_row.expense_account_id, v_row.scheduled_amount, 0,
                v_group.venue, v_group.venue_id, 'Depr — ' || v_row.name, v_line_no);
      v_line_no := v_line_no + 1;

      UPDATE fixed_asset_depreciation_schedule
        SET status='posted', posted_amount=v_row.scheduled_amount, journal_entry_id=v_entry_id, posted_at=now()
        WHERE id = v_row.sched_id;

      UPDATE fixed_assets
        SET amount_depreciated = amount_depreciated + v_row.scheduled_amount,
            amount_remaining   = amount_remaining   - v_row.scheduled_amount,
            status = CASE WHEN amount_remaining - v_row.scheduled_amount <= 0.01 AND status='active'
                          THEN 'fully_depreciated' ELSE status END
        WHERE id = v_row.asset_id;
    END LOOP;

    -- Single credit line: 1550 for total
    INSERT INTO journal_lines (tenant_id, entry_id, account_id, debit, credit, venue, venue_id, memo, line_no)
      SELECT p_tenant_id, v_entry_id, ca.id, 0, v_total, v_group.venue, v_group.venue_id,
             'Accumulated depreciation', v_line_no
      FROM chart_of_accounts ca WHERE ca.tenant_id = p_tenant_id AND ca.code = '1550';

    v_entries := array_append(v_entries, v_entry_id);
  END LOOP;

  RETURN v_entries;
END $$;

-- =====================================================================
-- 9) dispose_fixed_asset
-- =====================================================================
CREATE OR REPLACE FUNCTION public.dispose_fixed_asset(
  p_asset_id uuid, p_disposal_date date, p_proceeds numeric, p_memo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fa fixed_assets%ROWTYPE;
  v_entry_id uuid;
  v_ap_cash uuid; -- proceeds land in a cash/ar account chosen elsewhere; here we credit gain/loss net.
  v_gain_loss uuid;
  v_nbv numeric(14,2);
  v_line int := 1;
  v_auth uuid := auth.uid();
BEGIN
  SELECT * INTO fa FROM fixed_assets WHERE id = p_asset_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset % not found', p_asset_id; END IF;
  IF fa.status = 'disposed' THEN RAISE EXCEPTION 'Asset already disposed'; END IF;

  SELECT id INTO v_gain_loss FROM chart_of_accounts WHERE tenant_id=fa.tenant_id AND code='8020';
  IF v_gain_loss IS NULL THEN RAISE EXCEPTION '8020 Gain/Loss account missing'; END IF;

  v_nbv := fa.cost - fa.amount_depreciated;

  INSERT INTO journal_entries (tenant_id, entry_date, memo, source_type, source_id, venue, venue_id, status, created_by, posted_at)
    VALUES (fa.tenant_id, p_disposal_date,
            COALESCE(p_memo, 'Disposal — ' || fa.name),
            'asset_disposal', 'asset:' || fa.id::text,
            fa.venue, fa.venue_id, 'posted', v_auth, now())
    RETURNING id INTO v_entry_id;

  -- Cr Asset (cost)
  INSERT INTO journal_lines (tenant_id, entry_id, account_id, debit, credit, venue, venue_id, memo, line_no)
    VALUES (fa.tenant_id, v_entry_id, fa.asset_account_id, 0, fa.cost, fa.venue, fa.venue_id, 'Retire asset cost', v_line);
  v_line := v_line + 1;
  -- Dr Accum Depr
  IF fa.amount_depreciated > 0 THEN
    INSERT INTO journal_lines (tenant_id, entry_id, account_id, debit, credit, venue, venue_id, memo, line_no)
      VALUES (fa.tenant_id, v_entry_id, fa.accumulated_depr_account_id, fa.amount_depreciated, 0,
              fa.venue, fa.venue_id, 'Retire accumulated depreciation', v_line);
    v_line := v_line + 1;
  END IF;
  -- Dr Cash (proceeds) — only if provided
  IF p_proceeds IS NOT NULL AND p_proceeds > 0 THEN
    INSERT INTO journal_lines (tenant_id, entry_id, account_id, debit, credit, venue, venue_id, memo, line_no)
      SELECT fa.tenant_id, v_entry_id, ca.id, p_proceeds, 0, fa.venue, fa.venue_id, 'Disposal proceeds', v_line
      FROM chart_of_accounts ca WHERE ca.tenant_id=fa.tenant_id AND ca.code='1010' LIMIT 1;
    v_line := v_line + 1;
  END IF;
  -- Plug: Gain/Loss balances the entry
  -- Debits so far: accum_depr + proceeds. Credits: cost. Plug = cost - accum_depr - proceeds = NBV - proceeds
  -- If plug > 0 => loss (Dr 8020). If plug < 0 => gain (Cr 8020).
  DECLARE v_plug numeric(14,2);
  BEGIN
    v_plug := v_nbv - COALESCE(p_proceeds,0);
    IF v_plug > 0 THEN
      INSERT INTO journal_lines (tenant_id, entry_id, account_id, debit, credit, venue, venue_id, memo, line_no)
        VALUES (fa.tenant_id, v_entry_id, v_gain_loss, v_plug, 0, fa.venue, fa.venue_id, 'Loss on disposal', v_line);
    ELSIF v_plug < 0 THEN
      INSERT INTO journal_lines (tenant_id, entry_id, account_id, debit, credit, venue, venue_id, memo, line_no)
        VALUES (fa.tenant_id, v_entry_id, v_gain_loss, 0, -v_plug, fa.venue, fa.venue_id, 'Gain on disposal', v_line);
    END IF;
  END;

  -- Cancel remaining schedule
  UPDATE fixed_asset_depreciation_schedule
    SET status='skipped' WHERE asset_id = fa.id AND status='pending';

  UPDATE fixed_assets
    SET status='disposed', disposal_date=p_disposal_date, disposal_proceeds=p_proceeds,
        disposal_journal_entry_id=v_entry_id, amount_remaining=0
    WHERE id = fa.id;

  RETURN v_entry_id;
END $$;
