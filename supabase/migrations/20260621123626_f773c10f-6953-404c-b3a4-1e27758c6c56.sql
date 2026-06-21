ALTER TABLE public.expense_recurring_rules
  ADD COLUMN document_source text,
  ADD COLUMN document_notes text;

UPDATE public.expense_recurring_rules
  SET document_source = 'other'
  WHERE document_source IS NULL;

COMMENT ON COLUMN public.expense_recurring_rules.document_source IS 'Type of supporting document: contract_lease, supplier_invoice, supplier_statement, bank_record, other';
COMMENT ON COLUMN public.expense_recurring_rules.document_notes IS 'Notes about the supporting document';

GRANT SELECT, INSERT, UPDATE ON public.expense_recurring_rules TO authenticated;
GRANT ALL ON public.expense_recurring_rules TO service_role;