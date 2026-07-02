-- Prompt 1: Tenant-scope 6 core financial tables
-- Idempotent: safe to re-run

DO $$
DECLARE
  v_khambu constant uuid := '00000000-0000-0000-0000-00000000beef';
  t text;
  tables text[] := ARRAY['invoices','invoice_line_items','invoice_payments','sales_records','expense_bills','journal_lines'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- 1. Add tenant_id column if missing
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE', t);
    -- 2. Backfill to KHAMBU
    EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', t, v_khambu);
    -- 3. Index
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id)', t||'_tenant_id_idx', t);
    -- 4. Ensure RLS enabled
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ============ INVOICES ============
DROP POLICY IF EXISTS "Authenticated can read invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authorized can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authorized can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can delete invoices" ON public.invoices;
DROP POLICY IF EXISTS "invoices_tenant_select" ON public.invoices;
DROP POLICY IF EXISTS "invoices_tenant_all" ON public.invoices;

CREATE POLICY "invoices_tenant_select" ON public.invoices
  FOR SELECT
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "invoices_tenant_all" ON public.invoices
  FOR ALL
  USING (
    (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
  )
  WITH CHECK (
    (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

-- ============ INVOICE_LINE_ITEMS ============
DROP POLICY IF EXISTS "Authenticated can read line items" ON public.invoice_line_items;
DROP POLICY IF EXISTS "Authorized can insert line items" ON public.invoice_line_items;
DROP POLICY IF EXISTS "Authorized can update line items" ON public.invoice_line_items;
DROP POLICY IF EXISTS "Admins can delete line items" ON public.invoice_line_items;
DROP POLICY IF EXISTS "invoice_line_items_tenant_select" ON public.invoice_line_items;
DROP POLICY IF EXISTS "invoice_line_items_tenant_all" ON public.invoice_line_items;

CREATE POLICY "invoice_line_items_tenant_select" ON public.invoice_line_items
  FOR SELECT
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "invoice_line_items_tenant_all" ON public.invoice_line_items
  FOR ALL
  USING (
    (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
  )
  WITH CHECK (
    (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_line_items TO authenticated;
GRANT ALL ON public.invoice_line_items TO service_role;

-- ============ INVOICE_PAYMENTS ============
DROP POLICY IF EXISTS "Authenticated can read invoice_payments" ON public.invoice_payments;
DROP POLICY IF EXISTS "invoice_payments_tenant_select" ON public.invoice_payments;
DROP POLICY IF EXISTS "invoice_payments_tenant_all" ON public.invoice_payments;

CREATE POLICY "invoice_payments_tenant_select" ON public.invoice_payments
  FOR SELECT
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "invoice_payments_tenant_all" ON public.invoice_payments
  FOR ALL
  USING (
    (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
  )
  WITH CHECK (
    (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_payments TO authenticated;
GRANT ALL ON public.invoice_payments TO service_role;

-- ============ SALES_RECORDS ============
DROP POLICY IF EXISTS "Allow public read" ON public.sales_records;
DROP POLICY IF EXISTS "Allow public insert" ON public.sales_records;
DROP POLICY IF EXISTS "Allow public update" ON public.sales_records;
DROP POLICY IF EXISTS "Allow public delete" ON public.sales_records;
DROP POLICY IF EXISTS "sales_records_tenant_select" ON public.sales_records;
DROP POLICY IF EXISTS "sales_records_tenant_all" ON public.sales_records;

CREATE POLICY "sales_records_tenant_select" ON public.sales_records
  FOR SELECT
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "sales_records_tenant_all" ON public.sales_records
  FOR ALL
  USING (
    (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
  )
  WITH CHECK (
    (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_records TO authenticated;
GRANT ALL ON public.sales_records TO service_role;

-- ============ EXPENSE_BILLS ============
DROP POLICY IF EXISTS "Authenticated read expense_bills" ON public.expense_bills;
DROP POLICY IF EXISTS "Authenticated insert expense_bills" ON public.expense_bills;
DROP POLICY IF EXISTS "Authenticated update expense_bills" ON public.expense_bills;
DROP POLICY IF EXISTS "Admin delete expense_bills" ON public.expense_bills;
DROP POLICY IF EXISTS "tenant_venue_select" ON public.expense_bills;
DROP POLICY IF EXISTS "expense_bills_tenant_select" ON public.expense_bills;
DROP POLICY IF EXISTS "expense_bills_tenant_all" ON public.expense_bills;

CREATE POLICY "expense_bills_tenant_select" ON public.expense_bills
  FOR SELECT
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "expense_bills_tenant_all" ON public.expense_bills
  FOR ALL
  USING (
    (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
  )
  WITH CHECK (
    (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_bills TO authenticated;
GRANT ALL ON public.expense_bills TO service_role;

-- ============ JOURNAL_LINES ============
DROP POLICY IF EXISTS "Authenticated can read journal_lines" ON public.journal_lines;
DROP POLICY IF EXISTS "Authorized can manage journal_lines" ON public.journal_lines;
DROP POLICY IF EXISTS "tenant_venue_select" ON public.journal_lines;
DROP POLICY IF EXISTS "tenant_venue_write" ON public.journal_lines;
DROP POLICY IF EXISTS "journal_lines_tenant_select" ON public.journal_lines;
DROP POLICY IF EXISTS "journal_lines_tenant_all" ON public.journal_lines;

CREATE POLICY "journal_lines_tenant_select" ON public.journal_lines
  FOR SELECT
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "journal_lines_tenant_all" ON public.journal_lines
  FOR ALL
  USING (
    (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
  )
  WITH CHECK (
    (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
    AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_lines TO authenticated;
GRANT ALL ON public.journal_lines TO service_role;