CREATE OR REPLACE FUNCTION public.fx_currencies_in_use(p_tenant uuid)
RETURNS TABLE(currency text, first_used date, used_in text, today_rate numeric, today_date date, today_nearest boolean, month_end_rate numeric, month_end_date date, month_end_nearest boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 WITH b AS (SELECT coalesce(base_currency,'HKD') base FROM tenants WHERE id=p_tenant),
 u AS (
  SELECT upper(currency) c, min(coalesce(opening_date,created_at::date)) d, 'Bank accounts' w FROM bank_accounts WHERE tenant_id=p_tenant GROUP BY 1
  UNION ALL SELECT upper(currency), min(bill_date), 'Bills' FROM expense_bills WHERE tenant_id=p_tenant GROUP BY 1
  UNION ALL SELECT upper(currency), min(invoice_date), 'Invoices' FROM invoices WHERE tenant_id=p_tenant AND currency IS NOT NULL GROUP BY 1
  UNION ALL SELECT upper(currency), min(txn_date), 'Bank lines' FROM bank_transactions WHERE tenant_id=p_tenant AND currency IS NOT NULL GROUP BY 1
  UNION ALL SELECT upper(currency), min(period_start), 'Card settlements' FROM payment_settlement_imports WHERE tenant_id=p_tenant GROUP BY 1
  UNION ALL SELECT upper(currency), min(coalesce(invoice_date,created_at::date)), 'Opening balances' FROM customer_opening_balances WHERE tenant_id=p_tenant GROUP BY 1
 ), g AS (SELECT c, min(d) d, string_agg(DISTINCT w, ' · ') w FROM u, b WHERE c IS NOT NULL AND c<>b.base GROUP BY c),
 me AS (SELECT (date_trunc('month', current_date) - interval '1 day')::date d)
 SELECT g.c, g.d, g.w, t.rate, t.rate_date, t.nearest, m.rate, m.rate_date, m.rate_date<>me.d
 FROM g CROSS JOIN me
 LEFT JOIN LATERAL fx_rate(p_tenant, current_date, g.c) t ON true
 LEFT JOIN LATERAL fx_rate(p_tenant, me.d, g.c) m ON true
 ORDER BY g.d NULLS LAST, g.c;
$$;
GRANT EXECUTE ON FUNCTION public.fx_currencies_in_use(uuid) TO authenticated;