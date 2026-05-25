CREATE UNIQUE INDEX IF NOT EXISTS invoices_supplier_invoice_number_uniq
ON public.invoices (supplier_id, invoice_number);