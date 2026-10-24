CREATE OR REPLACE VIEW public.v_cash_movements AS
SELECT
  je.id AS entry_id,
  je.entry_date,
  je.source_type,
  je.memo,
  je.venue,
  c.code AS account_code,
  c.name AS account_name,
  jl.debit AS cash_in,
  jl.credit AS cash_out,
  (jl.debit - jl.credit) AS net_cash,
  je.tenant_id AS tenant_id
FROM public.journal_lines jl
JOIN public.journal_entries je ON je.id = jl.entry_id AND je.status = 'posted'
JOIN public.chart_of_accounts c ON c.id = jl.account_id
WHERE c.is_cash = true;

ALTER VIEW public.v_cash_movements SET (security_invoker = true);