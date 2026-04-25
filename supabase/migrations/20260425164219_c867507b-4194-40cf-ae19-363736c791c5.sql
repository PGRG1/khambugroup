
-- 1. Rename 1210 to consolidated KPAY account
UPDATE public.chart_of_accounts
   SET name = 'Merchant Receivable - KPAY',
       description = 'Cash due from KPAY (handles Visa, Mastercard, Amex, UnionPay, JCB, Alipay, WeChat, PayMe). Settles ~T+2.'
 WHERE code = '1210';

-- 2. Repoint journal lines from old per-network accounts to KPAY
WITH kpay AS (SELECT id FROM public.chart_of_accounts WHERE code = '1210')
UPDATE public.journal_lines jl
   SET account_id = (SELECT id FROM kpay)
  FROM public.chart_of_accounts coa
 WHERE coa.id = jl.account_id
   AND coa.code IN ('1211','1212','1213','1214','1215','1216','1217');

-- 3. Repoint mapping rules for all card/e-wallet methods to KPAY
WITH kpay AS (SELECT id FROM public.chart_of_accounts WHERE code = '1210')
UPDATE public.account_mapping_rules
   SET account_id = (SELECT id FROM kpay),
       notes = 'Routed through KPAY merchant'
 WHERE rule_type = 'sales_payment_method'
   AND match_key IN ('visa','mastercard','amex','union_pay','jcb','alipay','wechat','payme');

-- 4. Deactivate empty per-network accounts (keep rows for audit trail of any old refs)
UPDATE public.chart_of_accounts
   SET is_active = false,
       description = COALESCE(description,'') || ' [Deprecated — consolidated into KPAY 1210]'
 WHERE code IN ('1211','1212','1213','1214','1215','1216','1217');
