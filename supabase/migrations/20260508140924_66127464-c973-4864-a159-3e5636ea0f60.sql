ALTER TABLE public.payment_settlement_transactions ADD COLUMN IF NOT EXISTS wallet_type text;
ALTER TABLE public.payment_processor_fee_rates ADD COLUMN IF NOT EXISTS wallet_type text;
CREATE INDEX IF NOT EXISTS idx_pst_wallet_type ON public.payment_settlement_transactions(wallet_type);
CREATE INDEX IF NOT EXISTS idx_ppfr_wallet_type ON public.payment_processor_fee_rates(wallet_type);