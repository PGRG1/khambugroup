ALTER TABLE public.journal_entries
DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;

ALTER TABLE public.journal_entries
ADD CONSTRAINT journal_entries_source_type_check
CHECK (
  source_type = ANY (
    ARRAY[
      'sales'::text,
      'sales_summary'::text,
      'invoice'::text,
      'invoice_payment'::text,
      'payroll_accrual'::text,
      'payroll_payment'::text,
      'mpf_payment'::text,
      'settlement_fee'::text,
      'settlement_clearing'::text,
      'bank_fee'::text,
      'bank_txn'::text,
      'manual'::text,
      'adjustment'::text,
      'opening'::text
    ]
  )
);