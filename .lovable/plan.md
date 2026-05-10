## Problem

Rebuild Ledger fails with:
> new row for relation "journal_entries" violates check constraint "journal_entries_source_type_check"

The `journal_entries.source_type` check constraint currently only allows:
`sales, invoice, invoice_payment, payroll_accrual, payroll_payment, mpf_payment, manual, adjustment, opening`

The new payment-processor settlement fee entries use `source_type = 'settlement_fee'`, which the constraint rejects.

## Fix

Single migration: drop and recreate the check constraint to include `'settlement_fee'`.

```sql
ALTER TABLE public.journal_entries
  DROP CONSTRAINT journal_entries_source_type_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'sales','invoice','invoice_payment',
    'payroll_accrual','payroll_payment','mpf_payment',
    'settlement_fee',
    'manual','adjustment','opening'
  ]));
```

After the migration runs, click **Rebuild Ledger** again — settlement fee entries will post successfully.
