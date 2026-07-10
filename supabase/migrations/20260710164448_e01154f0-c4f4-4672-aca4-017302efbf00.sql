
-- Fix broken RLS on expense_payment_terms: SELECT was USING(true), INSERT had no WITH CHECK,
-- UPDATE/DELETE only checked role but not tenant. Standardise to tenant-scoped policies.
DROP POLICY IF EXISTS "expense_payment_terms select" ON public.expense_payment_terms;
DROP POLICY IF EXISTS "expense_payment_terms insert" ON public.expense_payment_terms;
DROP POLICY IF EXISTS "expense_payment_terms update" ON public.expense_payment_terms;
DROP POLICY IF EXISTS "expense_payment_terms delete" ON public.expense_payment_terms;

CREATE POLICY "tenant_select" ON public.expense_payment_terms
  FOR SELECT
  USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "tenant_write" ON public.expense_payment_terms
  FOR ALL
  USING (
    (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  )
  WITH CHECK (
    (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
