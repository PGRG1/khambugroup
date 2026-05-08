
-- 1. Processors
CREATE TABLE public.payment_processors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'kpay',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name)
);

ALTER TABLE public.payment_processors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read payment_processors"
  ON public.payment_processors FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized can manage payment_processors"
  ON public.payment_processors FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- 2. Merchant accounts
CREATE TABLE public.payment_processor_merchants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  processor_id UUID NOT NULL REFERENCES public.payment_processors(id) ON DELETE CASCADE,
  merchant_number TEXT NOT NULL,
  display_name TEXT NOT NULL,
  venue TEXT,
  shared_venues TEXT[] NOT NULL DEFAULT '{}',
  default_bank_account_id UUID,
  fee_account_id UUID,
  store_address TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (processor_id, merchant_number)
);

ALTER TABLE public.payment_processor_merchants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read payment_processor_merchants"
  ON public.payment_processor_merchants FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized can manage payment_processor_merchants"
  ON public.payment_processor_merchants FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- 3. Imports
CREATE TABLE public.payment_settlement_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  processor_id UUID NOT NULL REFERENCES public.payment_processors(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  currency TEXT NOT NULL DEFAULT 'HKD',
  file_url TEXT,
  file_name TEXT,
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'uploaded',
  notes TEXT NOT NULL DEFAULT ''
);

ALTER TABLE public.payment_settlement_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read payment_settlement_imports"
  ON public.payment_settlement_imports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized can manage payment_settlement_imports"
  ON public.payment_settlement_imports FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- 4. Batches
CREATE TABLE public.payment_settlement_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id UUID REFERENCES public.payment_settlement_imports(id) ON DELETE CASCADE,
  processor_id UUID NOT NULL REFERENCES public.payment_processors(id) ON DELETE RESTRICT,
  merchant_id UUID NOT NULL REFERENCES public.payment_processor_merchants(id) ON DELETE RESTRICT,
  transaction_date DATE NOT NULL,
  settlement_date DATE NOT NULL,
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  fee_amount NUMERIC NOT NULL DEFAULT 0,
  points_offset NUMERIC NOT NULL DEFAULT 0,
  bank_transfer_fee NUMERIC NOT NULL DEFAULT 0,
  adjustments NUMERIC NOT NULL DEFAULT 0,
  frozen_amount NUMERIC NOT NULL DEFAULT 0,
  net_settlement NUMERIC NOT NULL DEFAULT 0,
  bank_account_id UUID,
  bank_transaction_id UUID,
  status TEXT NOT NULL DEFAULT 'unmatched',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_psb_settle_date ON public.payment_settlement_batches(settlement_date);
CREATE INDEX idx_psb_merchant ON public.payment_settlement_batches(merchant_id);
CREATE INDEX idx_psb_import ON public.payment_settlement_batches(import_id);

ALTER TABLE public.payment_settlement_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read payment_settlement_batches"
  ON public.payment_settlement_batches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized can manage payment_settlement_batches"
  ON public.payment_settlement_batches FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- 5. Lines
CREATE TABLE public.payment_settlement_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.payment_settlement_batches(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL,
  payment_type_label TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0,
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  fee_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_psl_batch ON public.payment_settlement_lines(batch_id);

ALTER TABLE public.payment_settlement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read payment_settlement_lines"
  ON public.payment_settlement_lines FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized can manage payment_settlement_lines"
  ON public.payment_settlement_lines FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- updated_at triggers
CREATE TRIGGER trg_pp_updated BEFORE UPDATE ON public.payment_processors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ppm_updated BEFORE UPDATE ON public.payment_processor_merchants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_psb_updated BEFORE UPDATE ON public.payment_settlement_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
  VALUES ('payment-statements', 'payment-statements', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can read payment statements"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-statements');

CREATE POLICY "Authorized can upload payment statements"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-statements'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "Authorized can update payment statements"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'payment-statements'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "Authorized can delete payment statements"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payment-statements'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

-- Seed KPay processor + merchants
INSERT INTO public.payment_processors (name, type, sort_order)
  VALUES ('KPay', 'kpay', 0)
  ON CONFLICT (name) DO NOTHING;

INSERT INTO public.payment_processor_merchants
  (processor_id, merchant_number, display_name, venue, shared_venues, store_address, sort_order)
SELECT p.id, '852124709700001', 'Assembly', 'Assembly', '{}',
       'GROUND FLOOR THE OUTSIDE SEATING MIRA STUDIO HOTEL 6 KNUTSFORD TERRACE KL', 0
FROM public.payment_processors p WHERE p.name = 'KPay'
ON CONFLICT (processor_id, merchant_number) DO NOTHING;

INSERT INTO public.payment_processor_merchants
  (processor_id, merchant_number, display_name, venue, shared_venues, sort_order)
SELECT p.id, '852124661800002', 'Caliente + Hanabi', NULL, ARRAY['Caliente','Hanabi'], 1
FROM public.payment_processors p WHERE p.name = 'KPay'
ON CONFLICT (processor_id, merchant_number) DO NOTHING;
