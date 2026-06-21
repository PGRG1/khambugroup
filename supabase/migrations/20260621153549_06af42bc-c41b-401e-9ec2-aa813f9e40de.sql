
-- 1. Set search_path on functions missing it
ALTER FUNCTION public.compute_ai_rule_key(jsonb, jsonb) SET search_path = public;
ALTER FUNCTION public.set_ai_rule_key() SET search_path = public;

-- 2. Switch views to security_invoker
ALTER VIEW public.v_cash_movements          SET (security_invoker = true);
ALTER VIEW public.v_product_mapping_status  SET (security_invoker = true);
ALTER VIEW public.v_trial_balance           SET (security_invoker = true);
ALTER VIEW public.v_balance_sheet           SET (security_invoker = true);
ALTER VIEW public.v_invoices_postable       SET (security_invoker = true);
ALTER VIEW public.sales_data                SET (security_invoker = true);
ALTER VIEW public.v_general_ledger          SET (security_invoker = true);
ALTER VIEW public.v_pl                      SET (security_invoker = true);

-- 3a. Trigger-only functions: revoke from everyone
REVOKE EXECUTE ON FUNCTION public.cascade_venue_rename()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_tenant_id_default()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_recompute_invoice_alloc()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_allocation_vs_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_ai_rule_change()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_tenant()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_ai_rule_key()                FROM PUBLIC, anon, authenticated;

-- 3b. Posting / mutating operations: revoke from anon
REVOKE EXECUTE ON FUNCTION public.post_expense_bill(uuid)                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.post_expense_bill_payment(uuid)                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.post_payroll_accrual(integer, integer)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.post_payroll_payment_batch(uuid)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rebuild_payroll_accrual(integer, integer)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recompute_invoice_from_allocations(uuid)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reverse_and_regenerate_sales_journal(uuid)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.void_payroll_payment_batch(uuid)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_expense_bills()               FROM PUBLIC, anon;

-- 3c. Tenant / role helpers
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_admin(uuid, uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_tenant_id()             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_tenant(uuid, uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_venue(uuid, uuid)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_owns_kpi(uuid, uuid)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_tenant_ids(uuid)                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_venue_ids(uuid, uuid)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_payment_with_allocations(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rebuild_journal_from_operations()    FROM PUBLIC, anon;
