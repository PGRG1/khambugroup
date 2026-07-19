
-- ============================================================
-- Venue Cost Allocation — management-accounting overlay
-- Reporting-only. Does not touch journals, TB/BS, entity P&L.
-- ============================================================

-- 1. Profiles ------------------------------------------------
CREATE TABLE public.venue_allocation_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  method text NOT NULL DEFAULT 'manual_percent'
    CHECK (method IN ('manual_percent','even','by_seats','by_headcount')),
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_allocation_profiles TO authenticated;
GRANT ALL ON public.venue_allocation_profiles TO service_role;
ALTER TABLE public.venue_allocation_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read profiles"   ON public.venue_allocation_profiles FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
CREATE POLICY "tenant write profiles"  ON public.venue_allocation_profiles FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

-- 2. Profile lines (with effective dating) -------------------
CREATE TABLE public.venue_allocation_profile_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.venue_allocation_profiles(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  percent numeric(7,4) NOT NULL DEFAULT 0,
  effective_from date,     -- null = -infinity
  effective_to   date,     -- null = +infinity
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, venue_id, effective_from)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_allocation_profile_lines TO authenticated;
GRANT ALL ON public.venue_allocation_profile_lines TO service_role;
ALTER TABLE public.venue_allocation_profile_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read profile_lines"  ON public.venue_allocation_profile_lines FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
CREATE POLICY "tenant write profile_lines" ON public.venue_allocation_profile_lines FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

-- 3. Per-record overrides ------------------------------------
CREATE TABLE public.venue_allocation_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_type text NOT NULL CHECK (owner_type IN ('employee','expense_bill')),
  owner_id uuid NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  percent numeric(7,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_type, owner_id, venue_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_allocation_overrides TO authenticated;
GRANT ALL ON public.venue_allocation_overrides TO service_role;
ALTER TABLE public.venue_allocation_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant read overrides"  ON public.venue_allocation_overrides FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
CREATE POLICY "tenant write overrides" ON public.venue_allocation_overrides FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

CREATE INDEX idx_valloc_over_owner ON public.venue_allocation_overrides(owner_type, owner_id);

-- 4. Owner columns -------------------------------------------
ALTER TABLE public.hr_employees
  ADD COLUMN IF NOT EXISTS cost_allocation_profile_id uuid
    REFERENCES public.venue_allocation_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_allocation_mode text NOT NULL DEFAULT 'home_venue'
    CHECK (cost_allocation_mode IN ('home_venue','profile','custom'));

ALTER TABLE public.expense_bills
  ADD COLUMN IF NOT EXISTS cost_allocation_profile_id uuid
    REFERENCES public.venue_allocation_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_allocation_mode text NOT NULL DEFAULT 'manual'
    CHECK (cost_allocation_mode IN ('manual','profile','custom'));

-- 5. updated_at triggers -------------------------------------
CREATE TRIGGER trg_valloc_prof_upd BEFORE UPDATE ON public.venue_allocation_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_valloc_lines_upd BEFORE UPDATE ON public.venue_allocation_profile_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_valloc_over_upd BEFORE UPDATE ON public.venue_allocation_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Sum=100 guard for manual_percent ------------------------
-- (Enforced only for manual_percent profiles; derived methods normalize in the view.)
CREATE OR REPLACE FUNCTION public.check_venue_allocation_sum()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_profile uuid;
  v_method text;
  v_owner_type text;
  v_owner_id uuid;
  v_total numeric;
  v_effective_from date;
BEGIN
  IF TG_TABLE_NAME = 'venue_allocation_profile_lines' THEN
    v_profile := COALESCE(NEW.profile_id, OLD.profile_id);
    v_effective_from := COALESCE(NEW.effective_from, OLD.effective_from);
    SELECT method INTO v_method FROM public.venue_allocation_profiles WHERE id = v_profile;
    IF v_method <> 'manual_percent' THEN RETURN NULL; END IF;
    SELECT COALESCE(SUM(percent),0) INTO v_total
      FROM public.venue_allocation_profile_lines
      WHERE profile_id = v_profile
        AND effective_from IS NOT DISTINCT FROM v_effective_from;
    IF v_total NOT BETWEEN 99.99 AND 100.01 AND v_total <> 0 THEN
      RAISE EXCEPTION 'Venue allocation profile lines must sum to 100 (got %)', v_total;
    END IF;
  ELSIF TG_TABLE_NAME = 'venue_allocation_overrides' THEN
    v_owner_type := COALESCE(NEW.owner_type, OLD.owner_type);
    v_owner_id   := COALESCE(NEW.owner_id, OLD.owner_id);
    SELECT COALESCE(SUM(percent),0) INTO v_total
      FROM public.venue_allocation_overrides
      WHERE owner_type = v_owner_type AND owner_id = v_owner_id;
    IF v_total NOT BETWEEN 99.99 AND 100.01 AND v_total <> 0 THEN
      RAISE EXCEPTION 'Venue allocation overrides must sum to 100 (got %)', v_total;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_valloc_lines_sum
  AFTER INSERT OR UPDATE OR DELETE ON public.venue_allocation_profile_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_venue_allocation_sum();

CREATE CONSTRAINT TRIGGER trg_valloc_over_sum
  AFTER INSERT OR UPDATE OR DELETE ON public.venue_allocation_overrides
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_venue_allocation_sum();

-- 7. Resolver views ------------------------------------------
-- Effective profile line for a given as-of date
CREATE OR REPLACE FUNCTION public.expand_profile(p_profile uuid, p_as_of date)
RETURNS TABLE(venue_id uuid, percent numeric) LANGUAGE sql STABLE AS $$
  WITH prof AS (SELECT * FROM public.venue_allocation_profiles WHERE id = p_profile),
       eff_lines AS (
         SELECT l.venue_id, l.percent
         FROM public.venue_allocation_profile_lines l
         WHERE l.profile_id = p_profile
           AND (l.effective_from IS NULL OR l.effective_from <= p_as_of)
           AND (l.effective_to   IS NULL OR l.effective_to   >= p_as_of)
       )
  SELECT venue_id,
         CASE (SELECT method FROM prof)
           WHEN 'manual_percent' THEN percent
           WHEN 'even' THEN 100.0 / NULLIF((SELECT count(*) FROM eff_lines),0)
           WHEN 'by_seats' THEN
             (SELECT v.seats FROM public.venues v WHERE v.id = eff_lines.venue_id)::numeric * 100.0
             / NULLIF((SELECT SUM(v.seats) FROM public.venues v
                       WHERE v.id IN (SELECT venue_id FROM eff_lines)),0)
           WHEN 'by_headcount' THEN
             (SELECT count(*) FROM public.hr_employees e
                WHERE e.venue_id = eff_lines.venue_id AND e.status = 'active')::numeric * 100.0
             / NULLIF((SELECT count(*) FROM public.hr_employees e
                       WHERE e.venue_id IN (SELECT venue_id FROM eff_lines)
                         AND e.status = 'active'),0)
         END AS percent
  FROM eff_lines;
$$;

-- Employee split: overrides > profile > home venue (100%).
CREATE OR REPLACE VIEW public.v_employee_venue_allocation AS
WITH ov AS (
  SELECT e.tenant_id, e.id AS employee_id, o.venue_id, o.percent
  FROM public.hr_employees e
  JOIN public.venue_allocation_overrides o
    ON o.owner_type='employee' AND o.owner_id = e.id
),
prof AS (
  SELECT e.tenant_id, e.id AS employee_id, x.venue_id, x.percent
  FROM public.hr_employees e
  CROSS JOIN LATERAL public.expand_profile(e.cost_allocation_profile_id, CURRENT_DATE) x
  WHERE e.cost_allocation_mode = 'profile'
    AND e.cost_allocation_profile_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM ov WHERE ov.employee_id = e.id)
),
home AS (
  SELECT e.tenant_id, e.id AS employee_id, e.venue_id, 100::numeric AS percent
  FROM public.hr_employees e
  WHERE NOT EXISTS (SELECT 1 FROM ov   WHERE ov.employee_id   = e.id)
    AND NOT EXISTS (SELECT 1 FROM prof WHERE prof.employee_id = e.id)
)
SELECT * FROM ov
UNION ALL SELECT * FROM prof
UNION ALL SELECT * FROM home;

GRANT SELECT ON public.v_employee_venue_allocation TO authenticated, service_role;

-- Bill split
CREATE OR REPLACE VIEW public.v_bill_venue_allocation AS
WITH ov AS (
  SELECT b.tenant_id, b.id AS bill_id, o.venue_id, o.percent
  FROM public.expense_bills b
  JOIN public.venue_allocation_overrides o
    ON o.owner_type='expense_bill' AND o.owner_id = b.id
),
prof AS (
  SELECT b.tenant_id, b.id AS bill_id, x.venue_id, x.percent
  FROM public.expense_bills b
  CROSS JOIN LATERAL public.expand_profile(b.cost_allocation_profile_id, b.bill_date) x
  WHERE b.cost_allocation_mode = 'profile'
    AND b.cost_allocation_profile_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM ov WHERE ov.bill_id = b.id)
),
home AS (
  SELECT b.tenant_id, b.id AS bill_id, b.venue_id, 100::numeric AS percent
  FROM public.expense_bills b
  WHERE NOT EXISTS (SELECT 1 FROM ov   WHERE ov.bill_id   = b.id)
    AND NOT EXISTS (SELECT 1 FROM prof WHERE prof.bill_id = b.id)
)
SELECT * FROM ov
UNION ALL SELECT * FROM prof
UNION ALL SELECT * FROM home;

GRANT SELECT ON public.v_bill_venue_allocation TO authenticated, service_role;

-- 8. Rewrite labor cost view ---------------------------------
DROP VIEW IF EXISTS public.v_labor_cost_by_venue_month CASCADE;
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

-- 9. New expense-by-venue view -------------------------------
CREATE OR REPLACE VIEW public.v_venue_expense_month AS
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
