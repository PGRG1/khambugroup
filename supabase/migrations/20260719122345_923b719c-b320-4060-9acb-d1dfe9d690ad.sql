
-- 1) Drop dependent views + old resolver
DROP VIEW IF EXISTS public.v_labor_cost_by_venue_month CASCADE;
DROP VIEW IF EXISTS public.v_venue_expense_month CASCADE;
DROP VIEW IF EXISTS public.v_employee_venue_allocation CASCADE;
DROP VIEW IF EXISTS public.v_bill_venue_allocation CASCADE;
DROP FUNCTION IF EXISTS public.expand_profile(uuid, date);

-- 2) Drop profile FK columns then profile tables
ALTER TABLE public.hr_employees   DROP COLUMN IF EXISTS cost_allocation_profile_id;
ALTER TABLE public.expense_bills  DROP COLUMN IF EXISTS cost_allocation_profile_id;
DROP TABLE IF EXISTS public.venue_allocation_profile_lines;
DROP TABLE IF EXISTS public.venue_allocation_profiles;

-- 3) Simplify cost_allocation_mode to 'single' | 'split'
ALTER TABLE public.hr_employees  DROP CONSTRAINT IF EXISTS hr_employees_cost_allocation_mode_check;
ALTER TABLE public.expense_bills DROP CONSTRAINT IF EXISTS expense_bills_cost_allocation_mode_check;
UPDATE public.hr_employees  SET cost_allocation_mode = 'single' WHERE cost_allocation_mode IS NULL OR cost_allocation_mode NOT IN ('split');
UPDATE public.expense_bills SET cost_allocation_mode = 'single' WHERE cost_allocation_mode IS NULL OR cost_allocation_mode NOT IN ('split');
ALTER TABLE public.hr_employees
  ALTER COLUMN cost_allocation_mode SET DEFAULT 'single',
  ALTER COLUMN cost_allocation_mode SET NOT NULL,
  ADD CONSTRAINT hr_employees_cost_allocation_mode_check
    CHECK (cost_allocation_mode IN ('single','split'));
ALTER TABLE public.expense_bills
  ALTER COLUMN cost_allocation_mode SET DEFAULT 'single',
  ALTER COLUMN cost_allocation_mode SET NOT NULL,
  ADD CONSTRAINT expense_bills_cost_allocation_mode_check
    CHECK (cost_allocation_mode IN ('single','split'));

-- 4) Extend overrides with split_mode + amount
ALTER TABLE public.venue_allocation_overrides
  ADD COLUMN IF NOT EXISTS split_mode text NOT NULL DEFAULT 'percent'
    CHECK (split_mode IN ('percent','amount')),
  ADD COLUMN IF NOT EXISTS amount numeric(18,2) NOT NULL DEFAULT 0;

-- 5) Rewrite sum trigger: percent-mode must sum to 100; amount-mode not enforced here
CREATE OR REPLACE FUNCTION public.check_venue_allocation_sum()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_owner_type text;
  v_owner_id uuid;
  v_total numeric;
  v_count_pct int;
BEGIN
  v_owner_type := COALESCE(NEW.owner_type, OLD.owner_type);
  v_owner_id   := COALESCE(NEW.owner_id,   OLD.owner_id);
  SELECT COALESCE(SUM(percent),0), COUNT(*)
    INTO v_total, v_count_pct
    FROM public.venue_allocation_overrides
    WHERE owner_type = v_owner_type
      AND owner_id   = v_owner_id
      AND split_mode = 'percent';
  IF v_count_pct > 0
     AND v_total NOT BETWEEN 99.99 AND 100.01 THEN
    RAISE EXCEPTION 'Percent venue splits for % % must sum to 100 (got %)',
      v_owner_type, v_owner_id, v_total;
  END IF;
  RETURN NULL;
END;
$$;

-- 6) Resolver views: overrides > home venue
-- percent = supplied percent OR (amount / base * 100)
CREATE OR REPLACE VIEW public.v_employee_venue_allocation AS
WITH base AS (
  SELECT e.id AS employee_id, e.tenant_id, e.venue_id AS home_venue_id
  FROM public.hr_employees e
),
ov AS (
  SELECT b.tenant_id, b.employee_id, o.venue_id,
         o.split_mode, o.percent, o.amount
  FROM base b
  JOIN public.venue_allocation_overrides o
    ON o.owner_type = 'employee' AND o.owner_id = b.employee_id
),
home AS (
  SELECT b.tenant_id, b.employee_id, b.home_venue_id AS venue_id,
         'percent'::text AS split_mode, 100::numeric AS percent, 0::numeric AS amount
  FROM base b
  WHERE NOT EXISTS (SELECT 1 FROM ov WHERE ov.employee_id = b.employee_id)
)
SELECT * FROM ov
UNION ALL SELECT * FROM home;
GRANT SELECT ON public.v_employee_venue_allocation TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_bill_venue_allocation AS
WITH base AS (
  SELECT b.id AS bill_id, b.tenant_id, b.venue_id AS home_venue_id,
         COALESCE(b.total_amount,0) AS total_amount
  FROM public.expense_bills b
),
ov AS (
  SELECT b.tenant_id, b.bill_id, o.venue_id,
         o.split_mode,
         CASE WHEN o.split_mode = 'percent' THEN o.percent
              WHEN NULLIF(b.total_amount,0) IS NULL THEN 0
              ELSE ROUND(o.amount / b.total_amount * 100.0, 4)
         END AS percent,
         o.amount
  FROM base b
  JOIN public.venue_allocation_overrides o
    ON o.owner_type = 'expense_bill' AND o.owner_id = b.bill_id
),
home AS (
  SELECT b.tenant_id, b.bill_id, b.home_venue_id AS venue_id,
         'percent'::text AS split_mode, 100::numeric AS percent, 0::numeric AS amount
  FROM base b
  WHERE NOT EXISTS (SELECT 1 FROM ov WHERE ov.bill_id = b.bill_id)
)
SELECT * FROM ov
UNION ALL SELECT * FROM home;
GRANT SELECT ON public.v_bill_venue_allocation TO authenticated, service_role;

-- 7) Labor cost by venue month (uses real venues, Unassigned fallback)
CREATE VIEW public.v_labor_cost_by_venue_month AS
WITH payroll_by_venue AS (
  SELECT
    p.tenant_id,
    COALESCE(v.name, 'Unassigned') AS venue,
    p.year, p.month,
    SUM(
      (COALESCE(p.gross_salary, p.actual_total, p.forecast_total, 0)
       + COALESCE(p.mpf_employer, 0))
      * COALESCE(a.percent, 100) / 100.0
    ) AS labor_cost
  FROM public.hr_payroll p
  JOIN public.hr_employees e ON e.id = p.employee_id
  LEFT JOIN public.v_employee_venue_allocation a ON a.employee_id = e.id
  LEFT JOIN public.venues v ON v.id = COALESCE(a.venue_id, e.venue_id)
  GROUP BY p.tenant_id, COALESCE(v.name, 'Unassigned'), p.year, p.month
),
revenue_by_venue AS (
  SELECT
    s.tenant_id,
    COALESCE(NULLIF(s.venue,''), 'Unassigned') AS venue,
    EXTRACT(YEAR  FROM s.date::date)::int AS year,
    EXTRACT(MONTH FROM s.date::date)::int AS month,
    SUM(COALESCE(s.subtotal,0) + COALESCE(s.service_charge,0)) AS revenue
  FROM public.sales_records s
  WHERE s.date IS NOT NULL AND s.date <> ''
  GROUP BY s.tenant_id, COALESCE(NULLIF(s.venue,''),'Unassigned'),
           EXTRACT(YEAR FROM s.date::date)::int, EXTRACT(MONTH FROM s.date::date)::int
)
SELECT
  COALESCE(p.tenant_id, r.tenant_id) AS tenant_id,
  COALESCE(p.venue, r.venue) AS venue,
  COALESCE(p.year, r.year) AS year,
  COALESCE(p.month, r.month) AS month,
  COALESCE(p.labor_cost, 0) AS labor_cost,
  COALESCE(r.revenue, 0) AS revenue,
  CASE WHEN COALESCE(r.revenue,0) > 0
       THEN ROUND(COALESCE(p.labor_cost,0)/r.revenue*100, 2)
       ELSE NULL END AS labor_cost_pct
FROM payroll_by_venue p
FULL JOIN revenue_by_venue r
  ON r.tenant_id = p.tenant_id AND r.venue = p.venue
 AND r.year = p.year AND r.month = p.month;
GRANT SELECT ON public.v_labor_cost_by_venue_month TO authenticated, service_role;

-- 8) Expense by venue month
CREATE VIEW public.v_venue_expense_month AS
SELECT
  b.tenant_id,
  COALESCE(v.name, 'Unassigned') AS venue,
  EXTRACT(YEAR  FROM b.bill_date)::int AS year,
  EXTRACT(MONTH FROM b.bill_date)::int AS month,
  SUM(b.total_amount * COALESCE(a.percent, 100) / 100.0) AS expense_amount
FROM public.expense_bills b
LEFT JOIN public.v_bill_venue_allocation a ON a.bill_id = b.id
LEFT JOIN public.venues v ON v.id = COALESCE(a.venue_id, b.venue_id)
WHERE b.approval_status = 'posted'
GROUP BY b.tenant_id, COALESCE(v.name,'Unassigned'),
         EXTRACT(YEAR FROM b.bill_date)::int, EXTRACT(MONTH FROM b.bill_date)::int;
GRANT SELECT ON public.v_venue_expense_month TO authenticated, service_role;
