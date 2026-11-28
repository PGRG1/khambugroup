-- Books setup is for books approvers (Bani, business admin, Approve on Finance), like an ERP's conversion balances.
-- Supplier / customer / deposit openings and the books start date follow the same rule as the opening trial balance.

DROP POLICY IF EXISTS sob_insert_admin_manager ON public.supplier_opening_balances;
DROP POLICY IF EXISTS sob_update_admin_manager ON public.supplier_opening_balances;
DROP POLICY IF EXISTS sob_delete_admin_manager ON public.supplier_opening_balances;
CREATE POLICY sob_write_books_approver ON public.supplier_opening_balances FOR ALL TO authenticated
  USING (public.can_edit_account_rules(tenant_id)) WITH CHECK (public.can_edit_account_rules(tenant_id));

DROP POLICY IF EXISTS dob_insert_admin_manager ON public.deposit_opening_balances;
DROP POLICY IF EXISTS dob_update_admin_manager ON public.deposit_opening_balances;
DROP POLICY IF EXISTS dob_delete_admin_manager ON public.deposit_opening_balances;
CREATE POLICY dob_write_books_approver ON public.deposit_opening_balances FOR ALL TO authenticated
  USING (public.can_edit_account_rules(tenant_id)) WITH CHECK (public.can_edit_account_rules(tenant_id));

DROP POLICY IF EXISTS "cob write" ON public.customer_opening_balances;
CREATE POLICY cob_write_books_approver ON public.customer_opening_balances FOR ALL TO authenticated
  USING (public.can_edit_account_rules(tenant_id)) WITH CHECK (public.can_edit_account_rules(tenant_id));

-- app_config stays tenant-writable for other keys; the books start date needs a books approver.
CREATE OR REPLACE FUNCTION public.guard_books_start_date()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text := CASE WHEN TG_OP = 'DELETE' THEN OLD.key ELSE NEW.key END;
        t uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
BEGIN
  IF (k = 'books_start_date' OR (TG_OP = 'UPDATE' AND OLD.key = 'books_start_date'))
     AND auth.uid() IS NOT NULL AND NOT public.can_edit_account_rules(t) THEN
    RAISE EXCEPTION 'Only a books approver can change the books start date';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.guard_books_start_date() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_books_start_date ON public.app_config;
CREATE TRIGGER guard_books_start_date BEFORE INSERT OR UPDATE OR DELETE ON public.app_config
  FOR EACH ROW EXECUTE FUNCTION public.guard_books_start_date();
