
-- ============================================================
-- ACCOUNTING CORE: Chart of Accounts, Journal, Ledger, Reports
-- ============================================================

-- 1. Chart of Accounts
CREATE TABLE public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','cogs','opex','other_income','other_expense')),
  normal_side text NOT NULL CHECK (normal_side IN ('debit','credit')),
  parent_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_cash boolean NOT NULL DEFAULT false,
  description text DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coa_type ON public.chart_of_accounts(account_type);
CREATE INDEX idx_coa_parent ON public.chart_of_accounts(parent_id);

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read coa" ON public.chart_of_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage coa" ON public.chart_of_accounts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE TRIGGER trg_coa_updated BEFORE UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Journal Entries
CREATE TABLE public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  memo text NOT NULL DEFAULT '',
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN ('sales','invoice','invoice_payment','payroll_accrual','payroll_payment','mpf_payment','manual','adjustment','opening')),
  source_id text DEFAULT NULL,
  venue text DEFAULT NULL,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','void')),
  created_by uuid DEFAULT NULL,
  posted_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_je_date ON public.journal_entries(entry_date);
CREATE INDEX idx_je_source ON public.journal_entries(source_type, source_id);
CREATE INDEX idx_je_status ON public.journal_entries(status);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read journal_entries" ON public.journal_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage journal_entries" ON public.journal_entries FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE TRIGGER trg_je_updated BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Journal Lines
CREATE TABLE public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  debit numeric NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric NOT NULL DEFAULT 0 CHECK (credit >= 0),
  venue text DEFAULT NULL,
  memo text DEFAULT '',
  line_no int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_jl_entry ON public.journal_lines(entry_id);
CREATE INDEX idx_jl_account ON public.journal_lines(account_id);

ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read journal_lines" ON public.journal_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage journal_lines" ON public.journal_lines FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

-- Balance check trigger: every posted entry must have sum(debit)=sum(credit) and at least 2 lines
CREATE OR REPLACE FUNCTION public.check_journal_balance()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  d numeric;
  c numeric;
  lc int;
  st text;
BEGIN
  SELECT status INTO st FROM public.journal_entries WHERE id = COALESCE(NEW.entry_id, OLD.entry_id);
  IF st IS NULL OR st <> 'posted' THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0), COUNT(*) INTO d, c, lc
    FROM public.journal_lines WHERE entry_id = COALESCE(NEW.entry_id, OLD.entry_id);
  IF lc < 2 THEN
    RAISE EXCEPTION 'Journal entry must have at least 2 lines';
  END IF;
  IF ROUND(d,2) <> ROUND(c,2) THEN
    RAISE EXCEPTION 'Journal entry not balanced: debits=%, credits=%', d, c;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_jl_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_journal_balance();

-- 4. Account Mapping Rules
CREATE TABLE public.account_mapping_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type text NOT NULL CHECK (rule_type IN (
    'sales_revenue','service_charge','sales_cash',
    'payment_method_cash',
    'invoice_expense','accounts_payable',
    'payroll_salary_expense','payroll_mpf_expense','salary_payable','mpf_payable',
    'manual_income','manual_expense',
    'opening_equity'
  )),
  match_key text NOT NULL DEFAULT '',  -- e.g. venue name, payment_method, accounting_category text
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_type, match_key)
);
CREATE INDEX idx_amr_rule ON public.account_mapping_rules(rule_type);

ALTER TABLE public.account_mapping_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read mapping rules" ON public.account_mapping_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage mapping rules" ON public.account_mapping_rules FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE TRIGGER trg_amr_updated BEFORE UPDATE ON public.account_mapping_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SEED DEFAULT CHART OF ACCOUNTS
-- ============================================================
WITH inserted AS (
  INSERT INTO public.chart_of_accounts (code, name, account_type, normal_side, is_cash, sort_order) VALUES
    -- Assets
    ('1000','Assets','asset','debit',false,100),
    ('1010','Cash – Bank','asset','debit',true,110),
    ('1020','Cash on Hand','asset','debit',true,120),
    ('1100','Inventory','asset','debit',false,130),
    ('1200','Accounts Receivable','asset','debit',false,140),
    -- Liabilities
    ('2000','Liabilities','liability','credit',false,200),
    ('2010','Accounts Payable','liability','credit',false,210),
    ('2020','Tax Payable','liability','credit',false,220),
    ('2030','MPF Payable','liability','credit',false,230),
    ('2040','Salary Payable','liability','credit',false,240),
    -- Equity
    ('3000','Equity','equity','credit',false,300),
    ('3010','Owner Equity','equity','credit',false,310),
    ('3900','Retained Earnings','equity','credit',false,390),
    -- Revenue
    ('4000','Revenue','revenue','credit',false,400),
    ('4010','Sales – Assembly','revenue','credit',false,411),
    ('4020','Sales – Caliente','revenue','credit',false,412),
    ('4030','Sales – Hanabi','revenue','credit',false,413),
    ('4040','Sales – Events','revenue','credit',false,414),
    ('4100','Service Charge','revenue','credit',false,420),
    ('4900','Other Income','other_income','credit',false,490),
    -- COGS
    ('5000','Cost of Goods Sold','cogs','debit',false,500),
    ('5010','COGS – Food','cogs','debit',false,510),
    ('5020','COGS – Beverage','cogs','debit',false,520),
    ('5090','COGS – Other','cogs','debit',false,590),
    -- OpEx
    ('6000','Operating Expenses','opex','debit',false,600),
    ('6010','Salaries Expense','opex','debit',false,610),
    ('6020','MPF Expense','opex','debit',false,620),
    ('6030','Rent Expense','opex','debit',false,630),
    ('6040','Utilities Expense','opex','debit',false,640),
    ('6090','Other OpEx','opex','debit',false,690),
    ('7900','Other Expense','other_expense','debit',false,790)
  RETURNING id, code
)
SELECT 1; -- materialize

-- Set parents
UPDATE public.chart_of_accounts c SET parent_id = p.id
  FROM public.chart_of_accounts p
  WHERE p.code = '1000' AND c.code IN ('1010','1020','1100','1200');
UPDATE public.chart_of_accounts c SET parent_id = p.id
  FROM public.chart_of_accounts p
  WHERE p.code = '2000' AND c.code IN ('2010','2020','2030','2040');
UPDATE public.chart_of_accounts c SET parent_id = p.id
  FROM public.chart_of_accounts p
  WHERE p.code = '3000' AND c.code IN ('3010','3900');
UPDATE public.chart_of_accounts c SET parent_id = p.id
  FROM public.chart_of_accounts p
  WHERE p.code = '4000' AND c.code IN ('4010','4020','4030','4040','4100');
UPDATE public.chart_of_accounts c SET parent_id = p.id
  FROM public.chart_of_accounts p
  WHERE p.code = '5000' AND c.code IN ('5010','5020','5090');
UPDATE public.chart_of_accounts c SET parent_id = p.id
  FROM public.chart_of_accounts p
  WHERE p.code = '6000' AND c.code IN ('6010','6020','6030','6040','6090');

-- ============================================================
-- SEED DEFAULT MAPPING RULES
-- ============================================================
INSERT INTO public.account_mapping_rules (rule_type, match_key, account_id)
SELECT 'sales_revenue','Assembly', id FROM public.chart_of_accounts WHERE code='4010' UNION ALL
SELECT 'sales_revenue','Caliente', id FROM public.chart_of_accounts WHERE code='4020' UNION ALL
SELECT 'sales_revenue','Hanabi', id FROM public.chart_of_accounts WHERE code='4030' UNION ALL
SELECT 'sales_revenue','Events', id FROM public.chart_of_accounts WHERE code='4040' UNION ALL
SELECT 'service_charge','', id FROM public.chart_of_accounts WHERE code='4100' UNION ALL
SELECT 'sales_cash','', id FROM public.chart_of_accounts WHERE code='1010' UNION ALL
SELECT 'payment_method_cash','bank_transfer', id FROM public.chart_of_accounts WHERE code='1010' UNION ALL
SELECT 'payment_method_cash','cash', id FROM public.chart_of_accounts WHERE code='1020' UNION ALL
SELECT 'payment_method_cash','', id FROM public.chart_of_accounts WHERE code='1010' UNION ALL
SELECT 'invoice_expense','', id FROM public.chart_of_accounts WHERE code='5090' UNION ALL
SELECT 'accounts_payable','', id FROM public.chart_of_accounts WHERE code='2010' UNION ALL
SELECT 'payroll_salary_expense','', id FROM public.chart_of_accounts WHERE code='6010' UNION ALL
SELECT 'payroll_mpf_expense','', id FROM public.chart_of_accounts WHERE code='6020' UNION ALL
SELECT 'salary_payable','', id FROM public.chart_of_accounts WHERE code='2040' UNION ALL
SELECT 'mpf_payable','', id FROM public.chart_of_accounts WHERE code='2030' UNION ALL
SELECT 'manual_income','', id FROM public.chart_of_accounts WHERE code='4900' UNION ALL
SELECT 'manual_expense','', id FROM public.chart_of_accounts WHERE code='7900' UNION ALL
SELECT 'opening_equity','', id FROM public.chart_of_accounts WHERE code='3010';

-- ============================================================
-- VIEWS
-- ============================================================

CREATE OR REPLACE VIEW public.v_general_ledger AS
SELECT
  jl.id AS line_id,
  je.id AS entry_id,
  je.entry_date,
  je.memo AS entry_memo,
  je.source_type,
  je.source_id,
  je.venue AS entry_venue,
  je.status,
  jl.account_id,
  c.code AS account_code,
  c.name AS account_name,
  c.account_type,
  c.normal_side,
  jl.debit,
  jl.credit,
  jl.venue AS line_venue,
  jl.memo AS line_memo
FROM public.journal_lines jl
JOIN public.journal_entries je ON je.id = jl.entry_id
JOIN public.chart_of_accounts c ON c.id = jl.account_id
WHERE je.status = 'posted';

CREATE OR REPLACE VIEW public.v_trial_balance AS
SELECT
  c.id AS account_id,
  c.code,
  c.name,
  c.account_type,
  c.normal_side,
  COALESCE(SUM(jl.debit),0) AS total_debit,
  COALESCE(SUM(jl.credit),0) AS total_credit,
  CASE WHEN c.normal_side='debit'
       THEN COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0)
       ELSE COALESCE(SUM(jl.credit),0) - COALESCE(SUM(jl.debit),0)
  END AS balance
FROM public.chart_of_accounts c
LEFT JOIN public.journal_lines jl ON jl.account_id = c.id
LEFT JOIN public.journal_entries je ON je.id = jl.entry_id AND je.status='posted'
GROUP BY c.id, c.code, c.name, c.account_type, c.normal_side
ORDER BY c.code;

CREATE OR REPLACE VIEW public.v_pl AS
SELECT
  c.id AS account_id, c.code, c.name, c.account_type,
  je.entry_date,
  EXTRACT(YEAR FROM je.entry_date)::int AS year,
  EXTRACT(MONTH FROM je.entry_date)::int AS month,
  CASE WHEN c.account_type IN ('revenue','other_income') THEN (jl.credit - jl.debit)
       ELSE (jl.debit - jl.credit) END AS amount
FROM public.journal_lines jl
JOIN public.journal_entries je ON je.id = jl.entry_id AND je.status='posted'
JOIN public.chart_of_accounts c ON c.id = jl.account_id
WHERE c.account_type IN ('revenue','cogs','opex','other_income','other_expense');

CREATE OR REPLACE VIEW public.v_balance_sheet AS
SELECT
  c.id AS account_id, c.code, c.name, c.account_type,
  je.entry_date,
  CASE WHEN c.normal_side='debit' THEN (jl.debit - jl.credit) ELSE (jl.credit - jl.debit) END AS amount
FROM public.journal_lines jl
JOIN public.journal_entries je ON je.id = jl.entry_id AND je.status='posted'
JOIN public.chart_of_accounts c ON c.id = jl.account_id
WHERE c.account_type IN ('asset','liability','equity');

CREATE OR REPLACE VIEW public.v_cash_movements AS
SELECT
  je.id AS entry_id,
  je.entry_date,
  je.source_type,
  je.memo,
  je.venue,
  c.code AS account_code,
  c.name AS account_name,
  jl.debit AS cash_in,
  jl.credit AS cash_out,
  (jl.debit - jl.credit) AS net_cash
FROM public.journal_lines jl
JOIN public.journal_entries je ON je.id = jl.entry_id AND je.status='posted'
JOIN public.chart_of_accounts c ON c.id = jl.account_id
WHERE c.is_cash = true;

-- ============================================================
-- REBUILD FUNCTION: regenerates auto-posted entries
-- ============================================================
CREATE OR REPLACE FUNCTION public.rebuild_journal_from_operations()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  acc_sales_default uuid;
  acc_service uuid;
  acc_sales_cash uuid;
  acc_ap uuid;
  acc_invoice_default uuid;
  acc_salary_exp uuid;
  acc_mpf_exp uuid;
  acc_salary_pay uuid;
  acc_mpf_pay uuid;
  acc_manual_inc uuid;
  acc_manual_exp uuid;
  acc_opening_eq uuid;
  acc_cash_default uuid;
  e_id uuid;
  r record;
  cnt int := 0;
  opening_balance numeric;
  opening_date date;
BEGIN
  -- Wipe auto-posted entries (everything except 'manual')
  DELETE FROM public.journal_entries WHERE source_type <> 'manual';

  -- Resolve common accounts
  SELECT account_id INTO acc_service FROM public.account_mapping_rules WHERE rule_type='service_charge' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_sales_cash FROM public.account_mapping_rules WHERE rule_type='sales_cash' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_ap FROM public.account_mapping_rules WHERE rule_type='accounts_payable' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_invoice_default FROM public.account_mapping_rules WHERE rule_type='invoice_expense' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_salary_exp FROM public.account_mapping_rules WHERE rule_type='payroll_salary_expense' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_mpf_exp FROM public.account_mapping_rules WHERE rule_type='payroll_mpf_expense' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_salary_pay FROM public.account_mapping_rules WHERE rule_type='salary_payable' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_mpf_pay FROM public.account_mapping_rules WHERE rule_type='mpf_payable' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_manual_inc FROM public.account_mapping_rules WHERE rule_type='manual_income' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_manual_exp FROM public.account_mapping_rules WHERE rule_type='manual_expense' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_opening_eq FROM public.account_mapping_rules WHERE rule_type='opening_equity' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_cash_default FROM public.account_mapping_rules WHERE rule_type='payment_method_cash' AND match_key='' LIMIT 1;
  IF acc_cash_default IS NULL THEN acc_cash_default := acc_sales_cash; END IF;

  -- Opening balance
  SELECT opening_balance, opening_date INTO opening_balance, opening_date
    FROM public.cashflow_settings ORDER BY updated_at DESC LIMIT 1;
  IF opening_balance IS NOT NULL AND opening_balance <> 0 AND acc_opening_eq IS NOT NULL AND acc_sales_cash IS NOT NULL THEN
    INSERT INTO public.journal_entries (entry_date, memo, source_type, status)
      VALUES (COALESCE(opening_date, CURRENT_DATE), 'Opening cash balance', 'opening', 'draft')
      RETURNING id INTO e_id;
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
      VALUES (e_id, acc_sales_cash, opening_balance, 0, 1),
             (e_id, acc_opening_eq, 0, opening_balance, 2);
    UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
    cnt := cnt + 1;
  END IF;

  -- SALES — debit cash, credit revenue (per venue) + service charge
  FOR r IN
    SELECT s.date::date AS d, s.venue,
           COALESCE(SUM(s.subtotal),0) AS subtotal,
           COALESCE(SUM(s.service_charge),0) AS svc,
           COALESCE(SUM(s.total_sales),0) AS total
    FROM public.sales_records s
    GROUP BY s.date::date, s.venue
    HAVING COALESCE(SUM(s.total_sales),0) > 0
  LOOP
    SELECT account_id INTO acc_sales_default FROM public.account_mapping_rules
      WHERE rule_type='sales_revenue' AND match_key=r.venue LIMIT 1;
    IF acc_sales_default IS NULL OR acc_sales_cash IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
      VALUES (r.d, 'Sales — '||r.venue, 'sales', r.d::text||'|'||r.venue, r.venue, 'draft')
      RETURNING id INTO e_id;
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
      VALUES (e_id, acc_sales_cash, r.total, 0, r.venue, 1);
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
      VALUES (e_id, acc_sales_default, 0, GREATEST(r.total - r.svc, 0), r.venue, 2);
    IF r.svc > 0 AND acc_service IS NOT NULL THEN
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
        VALUES (e_id, acc_service, 0, r.svc, r.venue, 3);
    END IF;
    UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
    cnt := cnt + 1;
  END LOOP;

  -- INVOICES — debit expense (mapped per accounting_category from line items), credit AP
  FOR r IN
    SELECT i.id, i.invoice_date, i.venue, i.invoice_number, i.total_amount
    FROM public.invoices i
    WHERE COALESCE(i.total_amount,0) > 0
  LOOP
    INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
      VALUES (r.invoice_date, 'Invoice '||COALESCE(r.invoice_number,''), 'invoice', r.id::text, r.venue, 'draft')
      RETURNING id INTO e_id;
    -- expense lines per accounting_category mapping (fallback to default)
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
    SELECT e_id,
           COALESCE(am.account_id, acc_invoice_default),
           SUM(li.total),
           0,
           r.venue,
           ROW_NUMBER() OVER (ORDER BY 1),
           COALESCE(am.account_id::text, 'default')
    FROM public.invoice_line_items li
    LEFT JOIN public.product_master pm ON pm.id = li.product_master_id
    LEFT JOIN public.account_mapping_rules am ON am.rule_type='invoice_expense' AND am.match_key = COALESCE(pm.accounting_category,'')
    WHERE li.invoice_id = r.id
    GROUP BY COALESCE(am.account_id, acc_invoice_default);
    -- if no line items, single expense line with default
    IF NOT EXISTS (SELECT 1 FROM public.journal_lines WHERE entry_id = e_id) THEN
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
        VALUES (e_id, acc_invoice_default, r.total_amount, 0, r.venue, 1);
    END IF;
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
      VALUES (e_id, acc_ap, 0, r.total_amount, r.venue, 99);
    UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
    cnt := cnt + 1;
  END LOOP;

  -- INVOICE PAYMENTS — debit AP, credit Cash (by payment_method)
  FOR r IN
    SELECT p.id, p.payment_date, p.amount, p.payment_method, i.venue, i.invoice_number
    FROM public.invoice_payments p
    LEFT JOIN public.invoices i ON i.id = p.invoice_id
    WHERE COALESCE(p.amount,0) > 0
  LOOP
    SELECT account_id INTO acc_cash_default FROM public.account_mapping_rules
      WHERE rule_type='payment_method_cash' AND match_key = COALESCE(r.payment_method,'') LIMIT 1;
    IF acc_cash_default IS NULL THEN
      SELECT account_id INTO acc_cash_default FROM public.account_mapping_rules
        WHERE rule_type='payment_method_cash' AND match_key='' LIMIT 1;
    END IF;
    IF acc_cash_default IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
      VALUES (r.payment_date, 'Payment for '||COALESCE(r.invoice_number,''), 'invoice_payment', r.id::text, r.venue, 'draft')
      RETURNING id INTO e_id;
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
      VALUES (e_id, acc_ap, r.amount, 0, r.venue, 1),
             (e_id, acc_cash_default, 0, r.amount, r.venue, 2);
    UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
    cnt := cnt + 1;
  END LOOP;

  -- PAYROLL — accrual (salary expense + mpf expense → payables) on payroll record month-end
  FOR r IN
    SELECT id, year, month, COALESCE(net_salary,0) AS ns, COALESCE(mpf_employee,0) AS mpfee,
           COALESCE(mpf_employer,0) AS mpfer, COALESCE(gross_salary, COALESCE(net_salary,0)+COALESCE(mpf_employee,0)) AS gross,
           net_salary_payment_date, mpf_payment_date, mpf_payment_amount, payment_method
    FROM public.hr_payroll
    WHERE year IS NOT NULL AND month IS NOT NULL
  LOOP
    -- Accrual entry
    IF (r.gross + r.mpfer) > 0 THEN
      INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, status)
        VALUES (make_date(r.year, r.month, 1) + interval '1 month' - interval '1 day', 'Payroll accrual '||r.year||'-'||lpad(r.month::text,2,'0'), 'payroll_accrual', r.id::text, 'draft')
        RETURNING id INTO e_id;
      IF r.gross > 0 THEN
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
          VALUES (e_id, acc_salary_exp, r.gross, 0, 1);
      END IF;
      IF r.mpfer > 0 THEN
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
          VALUES (e_id, acc_mpf_exp, r.mpfer, 0, 2);
      END IF;
      IF r.ns > 0 THEN
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
          VALUES (e_id, acc_salary_pay, 0, r.ns, 3);
      END IF;
      -- balance: difference goes to MPF payable (employer + employee mpf component)
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
        VALUES (e_id, acc_mpf_pay, 0, GREATEST((r.gross + r.mpfer) - r.ns, 0), 4);
      UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
      cnt := cnt + 1;
    END IF;

    -- Net salary payment
    IF r.net_salary_payment_date IS NOT NULL AND r.ns > 0 THEN
      SELECT account_id INTO acc_cash_default FROM public.account_mapping_rules
        WHERE rule_type='payment_method_cash' AND match_key = COALESCE(r.payment_method,'bank_transfer') LIMIT 1;
      IF acc_cash_default IS NULL THEN
        SELECT account_id INTO acc_cash_default FROM public.account_mapping_rules
          WHERE rule_type='payment_method_cash' AND match_key='' LIMIT 1;
      END IF;
      INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, status)
        VALUES (r.net_salary_payment_date, 'Net salary paid '||r.year||'-'||lpad(r.month::text,2,'0'), 'payroll_payment', r.id::text, 'draft')
        RETURNING id INTO e_id;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
        VALUES (e_id, acc_salary_pay, r.ns, 0, 1),
               (e_id, acc_cash_default, 0, r.ns, 2);
      UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
      cnt := cnt + 1;
    END IF;

    -- MPF payment
    IF r.mpf_payment_date IS NOT NULL AND COALESCE(r.mpf_payment_amount,0) > 0 THEN
      SELECT account_id INTO acc_cash_default FROM public.account_mapping_rules
        WHERE rule_type='payment_method_cash' AND match_key='' LIMIT 1;
      INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, status)
        VALUES (r.mpf_payment_date, 'MPF paid '||r.year||'-'||lpad(r.month::text,2,'0'), 'mpf_payment', r.id::text, 'draft')
        RETURNING id INTO e_id;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
        VALUES (e_id, acc_mpf_pay, r.mpf_payment_amount, 0, 1),
               (e_id, acc_cash_default, 0, r.mpf_payment_amount, 2);
      UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
      cnt := cnt + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('entries_created', cnt);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rebuild_journal_from_operations() TO authenticated;
