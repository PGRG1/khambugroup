
-- Per-tenant sequence counter (advisory-locked on assign)
CREATE TABLE IF NOT EXISTS public.hr_employee_code_seq (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_seq integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hr_employee_code_seq TO authenticated;
GRANT ALL ON public.hr_employee_code_seq TO service_role;
ALTER TABLE public.hr_employee_code_seq ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seq_read_same_tenant" ON public.hr_employee_code_seq
  FOR SELECT TO authenticated USING (true);

-- Add employee_code column
ALTER TABLE public.hr_employees
  ADD COLUMN IF NOT EXISTS employee_code text;

CREATE UNIQUE INDEX IF NOT EXISTS hr_employees_tenant_code_uq
  ON public.hr_employees (tenant_id, employee_code)
  WHERE employee_code IS NOT NULL;

-- Assignment function
CREATE OR REPLACE FUNCTION public.assign_hr_employee_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_prefix text;
  v_seq integer;
BEGIN
  IF NEW.employee_code IS NOT NULL AND length(trim(NEW.employee_code)) > 0 THEN
    RETURN NEW;
  END IF;

  SELECT slug INTO v_slug FROM public.tenants WHERE id = NEW.tenant_id;
  IF v_slug IS NULL OR length(trim(v_slug)) = 0 THEN
    v_prefix := 'EMP';
  ELSE
    v_prefix := upper(regexp_replace(v_slug, '[^A-Za-z0-9]+', '', 'g'));
    IF length(v_prefix) = 0 THEN v_prefix := 'EMP'; END IF;
  END IF;

  -- Per-tenant advisory lock to serialize sequence bumps
  PERFORM pg_advisory_xact_lock(hashtext('hr_emp_code:' || NEW.tenant_id::text));

  INSERT INTO public.hr_employee_code_seq (tenant_id, last_seq)
    VALUES (NEW.tenant_id, 0)
    ON CONFLICT (tenant_id) DO NOTHING;

  UPDATE public.hr_employee_code_seq
     SET last_seq = last_seq + 1, updated_at = now()
   WHERE tenant_id = NEW.tenant_id
  RETURNING last_seq INTO v_seq;

  NEW.employee_code := v_prefix || '-' || lpad(v_seq::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_hr_employee_code ON public.hr_employees;
CREATE TRIGGER trg_assign_hr_employee_code
  BEFORE INSERT ON public.hr_employees
  FOR EACH ROW EXECUTE FUNCTION public.assign_hr_employee_code();

-- Backfill existing rows per tenant, ordered by hire_date ASC then created_at
DO $$
DECLARE
  t RECORD;
  e RECORD;
  v_prefix text;
  v_seq integer;
BEGIN
  FOR t IN SELECT id, slug FROM public.tenants LOOP
    v_prefix := upper(regexp_replace(coalesce(t.slug,''), '[^A-Za-z0-9]+', '', 'g'));
    IF length(v_prefix) = 0 THEN v_prefix := 'EMP'; END IF;
    v_seq := 0;
    FOR e IN
      SELECT id FROM public.hr_employees
       WHERE tenant_id = t.id AND employee_code IS NULL
       ORDER BY hire_date ASC NULLS LAST, created_at ASC, id ASC
    LOOP
      v_seq := v_seq + 1;
      UPDATE public.hr_employees
         SET employee_code = v_prefix || '-' || lpad(v_seq::text, 4, '0')
       WHERE id = e.id;
    END LOOP;
    IF v_seq > 0 THEN
      INSERT INTO public.hr_employee_code_seq (tenant_id, last_seq)
        VALUES (t.id, v_seq)
        ON CONFLICT (tenant_id) DO UPDATE
          SET last_seq = GREATEST(public.hr_employee_code_seq.last_seq, EXCLUDED.last_seq),
              updated_at = now();
    END IF;
  END LOOP;
END $$;
