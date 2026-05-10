ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'sales','invoice','invoice_payment',
    'payroll_accrual','payroll_payment','mpf_payment',
    'settlement_fee',
    'manual','adjustment','opening'
  ]));