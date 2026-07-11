-- Phase C4: keep hr_leave_balances in sync with hr_leave_ledger
CREATE OR REPLACE FUNCTION public.sync_leave_balance_from_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp uuid;
  v_type uuid;
  v_year int;
  v_tenant uuid;
  v_accrued numeric;
  v_taken numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_emp := OLD.employee_id; v_type := OLD.leave_type_id; v_year := OLD.year; v_tenant := OLD.tenant_id;
  ELSE
    v_emp := NEW.employee_id; v_type := NEW.leave_type_id; v_year := NEW.year; v_tenant := NEW.tenant_id;
  END IF;

  SELECT COALESCE(SUM(accrued),0), COALESCE(SUM(taken),0)
    INTO v_accrued, v_taken
    FROM public.hr_leave_ledger
   WHERE tenant_id = v_tenant
     AND employee_id = v_emp
     AND leave_type_id = v_type
     AND year = v_year;

  INSERT INTO public.hr_leave_balances (tenant_id, employee_id, leave_type_id, year, total_days, used_days, remaining_days)
  VALUES (v_tenant, v_emp, v_type, v_year, v_accrued, v_taken, v_accrued - v_taken)
  ON CONFLICT (tenant_id, employee_id, leave_type_id, year)
  DO UPDATE SET total_days = EXCLUDED.total_days,
                used_days  = EXCLUDED.used_days,
                remaining_days = EXCLUDED.total_days - EXCLUDED.used_days - COALESCE(hr_leave_balances.adjustments,0) * 0 + COALESCE(hr_leave_balances.adjustments,0),
                updated_at = now();
  RETURN NULL;
END;
$$;

-- Ensure unique index exists to support ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS ux_hr_leave_balances_scope
  ON public.hr_leave_balances(tenant_id, employee_id, leave_type_id, year);

DROP TRIGGER IF EXISTS trg_sync_leave_balance ON public.hr_leave_ledger;
CREATE TRIGGER trg_sync_leave_balance
AFTER INSERT OR UPDATE OR DELETE ON public.hr_leave_ledger
FOR EACH ROW EXECUTE FUNCTION public.sync_leave_balance_from_ledger();

-- Phase B10: Labor cost by venue by month view (tenant scoped via RLS on base tables)
CREATE OR REPLACE VIEW public.v_labor_cost_by_venue_month AS
WITH payroll_by_venue AS (
  SELECT
    p.tenant_id,
    COALESCE(NULLIF(e.venue, ''), 'Unassigned') AS venue,
    p.year,
    p.month,
    SUM(COALESCE(p.gross_salary, p.actual_total, p.forecast_total, 0)
        + COALESCE(p.mpf_employer, 0)) AS labor_cost
  FROM public.hr_payroll p
  JOIN public.hr_employees e ON e.id = p.employee_id
  GROUP BY p.tenant_id, COALESCE(NULLIF(e.venue, ''), 'Unassigned'), p.year, p.month
),
revenue_by_venue AS (
  SELECT
    s.tenant_id,
    COALESCE(NULLIF(s.venue, ''), 'Unassigned') AS venue,
    EXTRACT(YEAR  FROM s.date::date)::int AS year,
    EXTRACT(MONTH FROM s.date::date)::int AS month,
    SUM(COALESCE(s.subtotal, 0) + COALESCE(s.service_charge, 0)) AS revenue
  FROM public.sales_records s
  WHERE s.date IS NOT NULL AND s.date <> ''
  GROUP BY s.tenant_id, COALESCE(NULLIF(s.venue, ''), 'Unassigned'),
           EXTRACT(YEAR FROM s.date::date)::int,
           EXTRACT(MONTH FROM s.date::date)::int
)
SELECT
  COALESCE(p.tenant_id, r.tenant_id) AS tenant_id,
  COALESCE(p.venue, r.venue)         AS venue,
  COALESCE(p.year, r.year)           AS year,
  COALESCE(p.month, r.month)         AS month,
  COALESCE(p.labor_cost, 0)          AS labor_cost,
  COALESCE(r.revenue, 0)             AS revenue,
  CASE WHEN COALESCE(r.revenue,0) > 0
       THEN ROUND(COALESCE(p.labor_cost,0) / r.revenue * 100, 2)
       ELSE NULL END                 AS labor_cost_pct
FROM payroll_by_venue p
FULL OUTER JOIN revenue_by_venue r
  ON r.tenant_id = p.tenant_id AND r.venue = p.venue
 AND r.year = p.year AND r.month = p.month;

GRANT SELECT ON public.v_labor_cost_by_venue_month TO authenticated;
GRANT SELECT ON public.v_labor_cost_by_venue_month TO service_role;