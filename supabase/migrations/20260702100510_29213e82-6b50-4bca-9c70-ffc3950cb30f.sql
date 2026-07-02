
DROP POLICY IF EXISTS "tenant_venue_select" ON public.invoices;
DROP POLICY IF EXISTS "tenant_venue_write" ON public.invoices;
DROP POLICY IF EXISTS "tenant_select" ON public.invoice_line_items;
DROP POLICY IF EXISTS "tenant_write" ON public.invoice_line_items;
DROP POLICY IF EXISTS "tenant_select" ON public.invoice_payments;
DROP POLICY IF EXISTS "tenant_write" ON public.invoice_payments;
DROP POLICY IF EXISTS "tenant_venue_select" ON public.sales_records;
DROP POLICY IF EXISTS "tenant_venue_write" ON public.sales_records;
DROP POLICY IF EXISTS "tenant_venue_write" ON public.expense_bills;
