CREATE TABLE public.reconciliation_mapping_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL UNIQUE,
  bank_description_contains text NOT NULL DEFAULT '',
  bank_movement text NOT NULL DEFAULT 'either' CHECK (bank_movement IN ('money_in','money_out','either')),
  counterparty_type text NOT NULL DEFAULT '',
  classification text NOT NULL DEFAULT '',
  match_to text NOT NULL DEFAULT '',
  source_required boolean NOT NULL DEFAULT false,
  debit_account text NOT NULL DEFAULT '',
  credit_account text NOT NULL DEFAULT '',
  review_required boolean NOT NULL DEFAULT true,
  auto_post boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_mapping_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read recon mapping rules"
  ON public.reconciliation_mapping_rules FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authorized can manage recon mapping rules"
  ON public.reconciliation_mapping_rules FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_recon_mapping_rules_updated_at
  BEFORE UPDATE ON public.reconciliation_mapping_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_recon_mapping_rules_active ON public.reconciliation_mapping_rules (is_active, sort_order);

INSERT INTO public.reconciliation_mapping_rules
  (rule_name, bank_description_contains, bank_movement, counterparty_type, classification, match_to, source_required, debit_account, credit_account, review_required, auto_post, is_active, sort_order)
VALUES
  ('KPay Settlement','KPAY MERCHANT SERVICE LIMITED','money_in','Payment Processor','Merchant Settlement','KPay Report / Merchant Clearing',true,'Bank, KPay Fees','KPay Clearing',true,false,true,10),
  ('FPS Bank Fee','FPS OUT FEE','money_out','Bank','Bank Fee','No source required',false,'Bank Charges','Bank',false,false,true,20),
  ('Supplier Payment','ONGO FOOD LIMITED','money_out','Supplier','Supplier Payment','Supplier Invoice / AP',true,'Accounts Payable','Bank',true,false,true,30),
  ('Supplier Refund','ONGO FOOD LIMITED','money_in','Supplier','Supplier Refund','Credit Note / Supplier Balance',true,'Bank','Accounts Payable / Supplier Credit',true,false,true,40),
  ('Cash Deposit','ATM DEP','money_in','Cash','Cash Deposit','Cash on Hand',true,'Bank','Cash on Hand',true,false,true,50),
  ('Internal Transfer','CBS TRANSFER','either','Internal Bank Account','Internal Transfer','Opposite Bank Transaction',true,'Receiving Bank','Sending Bank',true,false,true,60),
  ('Payroll Payment','PRL DEBIT','money_out','Payroll','Payroll Payment','Payroll Run / Payroll Payable',true,'Payroll Payable','Bank',true,false,true,70),
  ('Payment Return','FPS RTN','money_in','Supplier / Employee / Other','Payment Return','Original Payment',true,'Bank','Original Payment Reversal',true,false,true,80),
  ('Interest Income','Interest','money_in','Bank','Interest Income','No source required',false,'Bank','Interest Income',false,false,true,90);