-- 1. Add columns to product_master
ALTER TABLE public.product_master
  ADD COLUMN IF NOT EXISTS financial_treatment text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS default_coa_account_id uuid NULL REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

-- 2. Validation trigger for financial_treatment values
CREATE OR REPLACE FUNCTION public.validate_financial_treatment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.financial_treatment NOT IN (
    '', 'COGS', 'OpEx',
    'Asset - Supplier Deposit', 'Asset - Fixed Asset',
    'Asset - Prepayment', 'Asset - Other'
  ) THEN
    RAISE EXCEPTION 'Invalid financial_treatment: %', NEW.financial_treatment;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_financial_treatment ON public.product_master;
CREATE TRIGGER trg_validate_financial_treatment
BEFORE INSERT OR UPDATE ON public.product_master
FOR EACH ROW EXECUTE FUNCTION public.validate_financial_treatment();

-- 3. Add category_l1 to journal_lines for P&L grouping
ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS category_l1 text NULL;

-- 4. Seed standard chart of accounts (idempotent)
INSERT INTO public.chart_of_accounts (code, name, account_type, normal_side, is_cash, is_active, sort_order, description)
VALUES
  ('1310', 'Supplier Deposits', 'asset', 'debit', false, true, 100, 'Refundable deposits paid to suppliers (kegs, bottles, crates)'),
  ('1320', 'Prepayments', 'asset', 'debit', false, true, 101, 'Prepaid expenses'),
  ('1500', 'Fixed Assets', 'asset', 'debit', false, true, 110, 'Equipment, fixtures, fittings'),
  ('2100', 'Accounts Payable', 'liability', 'credit', false, true, 200, 'Amounts owed to suppliers'),
  ('5100', 'Beverage COGS', 'cogs', 'debit', false, true, 510, 'Cost of beverages sold'),
  ('5110', 'Food COGS', 'cogs', 'debit', false, true, 511, 'Cost of food sold'),
  ('5120', 'Packaging COGS', 'cogs', 'debit', false, true, 512, 'Cost of packaging consumed in sales'),
  ('5130', 'Supplies COGS', 'cogs', 'debit', false, true, 513, 'Cost of consumable supplies'),
  ('6100', 'Cleaning & Hygiene Expense', 'opex', 'debit', false, true, 610, 'Cleaning supplies and chemicals'),
  ('6110', 'Operating Supplies Expense', 'opex', 'debit', false, true, 611, 'Non-resale operating supplies'),
  ('6120', 'Repairs & Maintenance', 'opex', 'debit', false, true, 612, 'Repairs and maintenance costs'),
  ('6130', 'Marketing', 'opex', 'debit', false, true, 613, 'Marketing & promotion'),
  ('6140', 'Software & Subscriptions', 'opex', 'debit', false, true, 614, 'Software & subscription expenses')
ON CONFLICT (code) DO NOTHING;

-- 5. Backfill financial_treatment from legacy accounting_category text
UPDATE public.product_master
SET financial_treatment = CASE
  WHEN accounting_category ILIKE '%deposit%' THEN 'Asset - Supplier Deposit'
  WHEN accounting_category ILIKE '%prepay%' THEN 'Asset - Prepayment'
  WHEN accounting_category ILIKE '%fixed%' OR accounting_category ILIKE '%equipment%' THEN 'Asset - Fixed Asset'
  WHEN accounting_category ILIKE '%cogs%' THEN 'COGS'
  WHEN accounting_category ILIKE '%opex%' OR accounting_category ILIKE '%expense%' THEN 'OpEx'
  ELSE ''
END
WHERE financial_treatment = '';

-- 6. Backfill default_coa_account_id by matching against account_mapping_rules of type invoice_expense
UPDATE public.product_master pm
SET default_coa_account_id = amr.account_id
FROM public.account_mapping_rules amr
WHERE pm.default_coa_account_id IS NULL
  AND amr.rule_type = 'invoice_expense'
  AND amr.match_key = pm.accounting_category
  AND pm.accounting_category <> '';

-- 7. View: mapping status per product
CREATE OR REPLACE VIEW public.v_product_mapping_status AS
SELECT
  pm.id,
  pm.internal_sku,
  pm.internal_product_name,
  pm.financial_treatment,
  pm.default_coa_account_id,
  CASE
    WHEN pm.financial_treatment <> '' AND pm.default_coa_account_id IS NOT NULL THEN 'Mapped'
    ELSE 'Unmapped'
  END AS mapping_status,
  CASE
    WHEN pm.financial_treatment = 'COGS' THEN 'COGS'
    WHEN pm.financial_treatment = 'OpEx' THEN 'Operating Expenses'
    WHEN pm.financial_treatment LIKE 'Asset%' THEN 'Not P&L / Balance Sheet Asset'
    ELSE '—'
  END AS pl_section
FROM public.product_master pm;

-- 8. View: postable invoices
CREATE OR REPLACE VIEW public.v_invoices_postable AS
SELECT
  i.id AS invoice_id,
  i.invoice_number,
  i.supplier_id,
  i.invoice_date,
  i.venue,
  i.status,
  COUNT(li.*) FILTER (
    WHERE li.product_master_id IS NULL
       OR pm.financial_treatment = ''
       OR pm.default_coa_account_id IS NULL
  ) AS unmapped_line_count,
  CASE
    WHEN COUNT(li.*) FILTER (
      WHERE li.product_master_id IS NULL
         OR pm.financial_treatment = ''
         OR pm.default_coa_account_id IS NULL
    ) = 0 THEN true
    ELSE false
  END AS is_postable
FROM public.invoices i
LEFT JOIN public.invoice_line_items li ON li.invoice_id = i.id
LEFT JOIN public.product_master pm ON pm.id = li.product_master_id
GROUP BY i.id;

-- 9. Rebuild journal function — sales (unchanged) + invoices (rewired) + payments
CREATE OR REPLACE FUNCTION public.rebuild_journal_from_operations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acc_sales uuid; acc_svc uuid; acc_disc uuid; acc_tips uuid;
  acc_cash uuid; acc_pm uuid; acc_suspense uuid;
  acc_ap uuid; acc_pay_cash uuid;
  e_id uuid; r record; cnt int := 0; v_ln int;
  v_method text; v_amt numeric;
  v_total_debits numeric; v_total_credits numeric; v_imbalance numeric;
  v_methods text[] := ARRAY['visa','mastercard','amex','union_pay','jcb','alipay','wechat','payme'];
  v_labels jsonb := '{"visa":"Visa","mastercard":"Mastercard","amex":"Amex","union_pay":"UnionPay","jcb":"JCB","alipay":"Alipay","wechat":"WeChat","payme":"PayMe"}'::jsonb;
  inv record; line record; supplier_name text;
  v_inv_unmapped int;
BEGIN
  DELETE FROM public.journal_entries WHERE source_type <> 'manual';
  SELECT id INTO acc_suspense FROM public.chart_of_accounts WHERE code='1900' LIMIT 1;
  SELECT id INTO acc_ap FROM public.chart_of_accounts WHERE code='2100' LIMIT 1;

  -- =====================================================================
  -- SALES (unchanged from prior version)
  -- =====================================================================
  FOR r IN
    SELECT s.date::date AS d, s.venue,
           ROUND(COALESCE(SUM(s.subtotal),0)::numeric, 2) AS subtotal,
           ROUND(COALESCE(SUM(s.service_charge),0)::numeric, 2) AS svc,
           ROUND(COALESCE(SUM(s.discount),0)::numeric, 2) AS discount,
           ROUND(COALESCE(SUM(s.cash),0)::numeric, 2)       AS m_cash,
           ROUND(COALESCE(SUM(s.visa),0)::numeric, 2)       AS m_visa,
           ROUND(COALESCE(SUM(s.mastercard),0)::numeric, 2) AS m_mastercard,
           ROUND(COALESCE(SUM(s.amex),0)::numeric, 2)       AS m_amex,
           ROUND(COALESCE(SUM(s.union_pay),0)::numeric, 2)  AS m_unionpay,
           ROUND(COALESCE(SUM(s.jcb),0)::numeric, 2)        AS m_jcb,
           ROUND(COALESCE(SUM(s.alipay),0)::numeric, 2)     AS m_alipay,
           ROUND(COALESCE(SUM(s.wechat),0)::numeric, 2)     AS m_wechat,
           ROUND(COALESCE(SUM(s.payme),0)::numeric, 2)      AS m_payme,
           ROUND(COALESCE(SUM(s.card_tips),0)::numeric, 2)  AS tips
    FROM public.sales_records s
    GROUP BY s.date::date, s.venue
    HAVING COALESCE(SUM(s.subtotal),0) + COALESCE(SUM(s.service_charge),0) + COALESCE(SUM(s.discount),0) + COALESCE(SUM(s.card_tips),0) <> 0
  LOOP
    SELECT account_id INTO acc_sales FROM public.account_mapping_rules
      WHERE rule_type='sales_revenue' AND match_key=r.venue LIMIT 1;
    SELECT account_id INTO acc_svc FROM public.account_mapping_rules
      WHERE rule_type='service_charge' AND match_key=r.venue LIMIT 1;
    SELECT account_id INTO acc_disc FROM public.account_mapping_rules
      WHERE rule_type='sales_discount' AND match_key=r.venue LIMIT 1;
    SELECT account_id INTO acc_tips FROM public.account_mapping_rules
      WHERE rule_type='tips_payable' AND match_key=r.venue LIMIT 1;

    acc_cash := NULL;
    SELECT account_id INTO acc_cash FROM public.account_mapping_rules
      WHERE rule_type='sales_payment_method' AND match_key='cash__'||r.venue LIMIT 1;
    IF acc_cash IS NULL THEN
      SELECT account_id INTO acc_cash FROM public.account_mapping_rules
        WHERE rule_type='sales_payment_method' AND match_key='cash' LIMIT 1;
    END IF;
    IF acc_cash IS NULL THEN
      SELECT account_id INTO acc_cash FROM public.account_mapping_rules
        WHERE rule_type='sales_cash' AND match_key='' LIMIT 1;
    END IF;

    IF acc_sales IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
      VALUES (r.d, 'Sales — '||r.venue, 'sales', r.d::text||'|'||r.venue, r.venue, 'draft')
      RETURNING id INTO e_id;

    v_ln := 0;

    IF r.m_cash > 0 AND acc_cash IS NOT NULL THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
        VALUES (e_id, acc_cash, r.m_cash, 0, r.venue, v_ln, 'Cash');
    END IF;

    FOREACH v_method IN ARRAY v_methods LOOP
      v_amt := CASE v_method
                 WHEN 'visa'       THEN r.m_visa
                 WHEN 'mastercard' THEN r.m_mastercard
                 WHEN 'amex'       THEN r.m_amex
                 WHEN 'union_pay'  THEN r.m_unionpay
                 WHEN 'jcb'        THEN r.m_jcb
                 WHEN 'alipay'     THEN r.m_alipay
                 WHEN 'wechat'     THEN r.m_wechat
                 WHEN 'payme'      THEN r.m_payme
               END;
      IF v_amt > 0 THEN
        acc_pm := NULL;
        SELECT account_id INTO acc_pm FROM public.account_mapping_rules
          WHERE rule_type='sales_payment_method' AND match_key=v_method||'__'||r.venue LIMIT 1;
        IF acc_pm IS NULL THEN
          SELECT account_id INTO acc_pm FROM public.account_mapping_rules
            WHERE rule_type='sales_payment_method' AND match_key=v_method LIMIT 1;
        END IF;
        IF acc_pm IS NOT NULL THEN
          v_ln := v_ln + 1;
          INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
            VALUES (e_id, acc_pm, v_amt, 0, r.venue, v_ln, COALESCE(v_labels->>v_method, v_method));
        END IF;
      END IF;
    END LOOP;

    IF ABS(r.discount) > 0 AND acc_disc IS NOT NULL THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
        VALUES (e_id, acc_disc, ABS(r.discount), 0, r.venue, v_ln, 'Sales discount');
    END IF;

    IF r.subtotal > 0 THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
        VALUES (e_id, acc_sales, 0, r.subtotal, r.venue, v_ln);
    END IF;

    IF r.svc > 0 AND acc_svc IS NOT NULL THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
        VALUES (e_id, acc_svc, 0, r.svc, r.venue, v_ln);
    END IF;

    IF ABS(r.tips) > 0 AND acc_tips IS NOT NULL THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
        VALUES (e_id, acc_tips, 0, ABS(r.tips), r.venue, v_ln, 'Card tips owed to staff');
    END IF;

    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
      INTO v_total_debits, v_total_credits
      FROM public.journal_lines WHERE entry_id = e_id;
    v_imbalance := ROUND(v_total_debits - v_total_credits, 2);
    IF v_imbalance <> 0 AND acc_suspense IS NOT NULL THEN
      v_ln := v_ln + 1;
      IF v_imbalance > 0 THEN
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
          VALUES (e_id, acc_suspense, 0, v_imbalance, r.venue, v_ln, 'Reconciliation difference');
      ELSE
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
          VALUES (e_id, acc_suspense, -v_imbalance, 0, r.venue, v_ln, 'Reconciliation difference');
      END IF;
      UPDATE public.journal_entries
        SET memo = memo || ' (reconciliation Δ ' || to_char(v_imbalance, 'FM999,999,990.00') || ')'
        WHERE id = e_id;
    END IF;

    UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
    cnt := cnt + 1;
  END LOOP;

  -- =====================================================================
  -- INVOICES (only approved + fully mapped)
  -- =====================================================================
  IF acc_ap IS NOT NULL THEN
    FOR inv IN
      SELECT i.id, i.invoice_date, i.venue, i.invoice_number, i.supplier_id,
             ROUND(i.total_amount::numeric, 2) AS total_amount,
             COALESCE(s.name, '') AS supplier_name
      FROM public.invoices i
      LEFT JOIN public.suppliers s ON s.id = i.supplier_id
      WHERE i.status = 'approved'
    LOOP
      -- Skip invoices with any unmapped line
      SELECT COUNT(*) INTO v_inv_unmapped
      FROM public.invoice_line_items li
      LEFT JOIN public.product_master pm ON pm.id = li.product_master_id
      WHERE li.invoice_id = inv.id
        AND (li.product_master_id IS NULL
             OR pm.financial_treatment = ''
             OR pm.default_coa_account_id IS NULL);
      IF v_inv_unmapped > 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
        VALUES (inv.invoice_date,
                'Invoice '||COALESCE(inv.invoice_number,'')||' — '||inv.supplier_name,
                'invoice', inv.id::text, inv.venue, 'draft')
        RETURNING id INTO e_id;

      v_ln := 0;
      -- Debit: aggregate line totals by mapped account + L1 category
      FOR line IN
        SELECT pm.default_coa_account_id AS acct,
               pm.level1_category AS l1,
               ROUND(SUM(li.total)::numeric, 2) AS amt
        FROM public.invoice_line_items li
        JOIN public.product_master pm ON pm.id = li.product_master_id
        WHERE li.invoice_id = inv.id
        GROUP BY pm.default_coa_account_id, pm.level1_category
      LOOP
        v_ln := v_ln + 1;
        IF line.amt >= 0 THEN
          INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo, category_l1)
            VALUES (e_id, line.acct, line.amt, 0, inv.venue, v_ln, inv.supplier_name, line.l1);
        ELSE
          INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo, category_l1)
            VALUES (e_id, line.acct, 0, -line.amt, inv.venue, v_ln, inv.supplier_name||' (refund/return)', line.l1);
        END IF;
      END LOOP;

      -- Credit: AP for net total (handles negative totals → debit AP)
      v_ln := v_ln + 1;
      IF inv.total_amount >= 0 THEN
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
          VALUES (e_id, acc_ap, 0, inv.total_amount, inv.venue, v_ln, inv.supplier_name);
      ELSE
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
          VALUES (e_id, acc_ap, -inv.total_amount, 0, inv.venue, v_ln, inv.supplier_name||' (credit note)');
      END IF;

      UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
      cnt := cnt + 1;
    END LOOP;

    -- =====================================================================
    -- INVOICE PAYMENTS
    -- =====================================================================
    FOR r IN
      SELECT p.id, p.payment_date, ROUND(p.amount::numeric,2) AS amount,
             p.payment_method, i.venue, i.invoice_number,
             COALESCE(s.name,'') AS supplier_name
      FROM public.invoice_payments p
      LEFT JOIN public.invoices i ON i.id = p.invoice_id
      LEFT JOIN public.suppliers s ON s.id = i.supplier_id
      WHERE p.amount <> 0
    LOOP
      acc_pay_cash := NULL;
      SELECT account_id INTO acc_pay_cash FROM public.account_mapping_rules
        WHERE rule_type='payment_method_cash' AND match_key = r.payment_method LIMIT 1;
      IF acc_pay_cash IS NULL THEN
        SELECT id INTO acc_pay_cash FROM public.chart_of_accounts WHERE is_cash = true ORDER BY code LIMIT 1;
      END IF;
      IF acc_pay_cash IS NULL THEN CONTINUE; END IF;

      INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
        VALUES (r.payment_date,
                'Payment for '||COALESCE(r.invoice_number,'')||' — '||r.supplier_name,
                'invoice_payment', r.id::text, r.venue, 'draft')
        RETURNING id INTO e_id;

      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
        VALUES (e_id, acc_ap, r.amount, 0, r.venue, 1, r.supplier_name);
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
        VALUES (e_id, acc_pay_cash, 0, r.amount, r.venue, 2, r.payment_method);

      UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
      cnt := cnt + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('entries_created', cnt);
END;
$$;