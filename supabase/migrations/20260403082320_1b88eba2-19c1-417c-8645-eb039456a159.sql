ALTER TABLE public.invoices 
  ADD COLUMN verified_by uuid DEFAULT NULL,
  ADD COLUMN verified_at timestamptz DEFAULT NULL,
  ADD COLUMN approved_by uuid DEFAULT NULL,
  ADD COLUMN approved_at timestamptz DEFAULT NULL;