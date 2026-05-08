
ALTER TABLE public.payment_settlement_lines
  ADD COLUMN IF NOT EXISTS expected_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_variance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audit_status text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS audit_note text NOT NULL DEFAULT '';

ALTER TABLE public.payment_settlement_batches
  ADD COLUMN IF NOT EXISTS transactions_flagged integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_variance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audit_status text NOT NULL DEFAULT 'ok';

CREATE TABLE IF NOT EXISTS public.payment_processor_fee_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processor_id uuid NOT NULL REFERENCES public.payment_processors(id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  locality text NOT NULL DEFAULT 'any',
  merchant_number text,
  rate numeric NOT NULL,
  rounding_dp integer NOT NULL DEFAULT 2,
  effective_from date NOT NULL DEFAULT '2000-01-01',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_processor_fee_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fee_rates_select_authenticated" ON public.payment_processor_fee_rates;
CREATE POLICY "fee_rates_select_authenticated"
  ON public.payment_processor_fee_rates FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "fee_rates_admin_all" ON public.payment_processor_fee_rates;
CREATE POLICY "fee_rates_admin_all"
  ON public.payment_processor_fee_rates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS update_fee_rates_updated_at ON public.payment_processor_fee_rates;
CREATE TRIGGER update_fee_rates_updated_at
  BEFORE UPDATE ON public.payment_processor_fee_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed KPay contracted rates
DO $$
DECLARE
  kpay_id uuid;
BEGIN
  SELECT id INTO kpay_id FROM public.payment_processors WHERE lower(name) = 'kpay' LIMIT 1;
  IF kpay_id IS NULL THEN RETURN; END IF;

  DELETE FROM public.payment_processor_fee_rates WHERE processor_id = kpay_id;

  INSERT INTO public.payment_processor_fee_rates (processor_id, payment_method, locality, merchant_number, rate, notes) VALUES
    (kpay_id, 'visa',                    'domestic', NULL, 0.0150, 'Visa domestic, all stores'),
    (kpay_id, 'visa_foreign',            'foreign',  NULL, 0.0300, 'Visa Foreign Card, all stores'),
    (kpay_id, 'mastercard',              'domestic', '852124709700001', 0.0260, 'Mastercard domestic — Assembly'),
    (kpay_id, 'mastercard',              'domestic', '852124661800002', 0.0150, 'Mastercard domestic — Caliente / Hanabi'),
    (kpay_id, 'mastercard_foreign',      'foreign',  NULL, 0.0300, 'Mastercard Foreign Card, all stores'),
    (kpay_id, 'alipay',                  'any',      NULL, 0.0120, 'Alipay (HK + CN)'),
    (kpay_id, 'wechat',                  'any',      NULL, 0.0120, 'WeChat Pay'),
    (kpay_id, 'union_pay',               'domestic', NULL, 0.0180, 'China UnionPay domestic'),
    (kpay_id, 'payme',                   'any',      NULL, 0.0110, 'PayMe from HSBC');
END $$;
