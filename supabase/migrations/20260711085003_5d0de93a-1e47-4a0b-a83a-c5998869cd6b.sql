CREATE INDEX IF NOT EXISTS idx_petty_cash_replenishments_tenant_id ON public.petty_cash_replenishments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bank_transaction_matches_tenant_id ON public.bank_transaction_matches (tenant_id);
CREATE INDEX IF NOT EXISTS idx_petty_cash_receipts_tenant_id ON public.petty_cash_receipts (tenant_id);