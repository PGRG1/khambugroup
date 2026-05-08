
CREATE TABLE public.payment_settlement_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.payment_settlement_batches(id) ON DELETE CASCADE,
  transaction_time timestamptz NOT NULL,
  payment_method_raw text NOT NULL DEFAULT '',
  payment_method_key text NOT NULL DEFAULT '',
  locality text NOT NULL DEFAULT '',
  merchant_number text NOT NULL DEFAULT '',
  gross_amount numeric NOT NULL DEFAULT 0,
  fee_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  expected_fee numeric NOT NULL DEFAULT 0,
  fee_variance numeric NOT NULL DEFAULT 0,
  audit_status text NOT NULL DEFAULT 'ok',
  reference text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pst_batch ON public.payment_settlement_transactions(batch_id);
CREATE INDEX idx_pst_time ON public.payment_settlement_transactions(transaction_time DESC);

ALTER TABLE public.payment_settlement_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read payment_settlement_transactions"
  ON public.payment_settlement_transactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized can manage payment_settlement_transactions"
  ON public.payment_settlement_transactions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
