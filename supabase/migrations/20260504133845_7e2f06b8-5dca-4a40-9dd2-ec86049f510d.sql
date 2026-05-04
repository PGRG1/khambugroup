
-- ---------- 1. venues ----------
CREATE TABLE IF NOT EXISTS public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  seats integer,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='venues' AND policyname='Authenticated can read venues') THEN
    CREATE POLICY "Authenticated can read venues" ON public.venues FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='venues' AND policyname='Authorized can manage venues') THEN
    CREATE POLICY "Authorized can manage venues" ON public.venues FOR ALL TO authenticated
      USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_venues_updated_at ON public.venues;
CREATE TRIGGER trg_venues_updated_at BEFORE UPDATE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.venues (name, seats, sort_order, is_system) VALUES
  ('Assembly', 70, 1, true),
  ('Caliente', 50, 2, true),
  ('Hanabi',   NULL, 3, true),
  ('Events',   NULL, 4, true)
ON CONFLICT (name) DO NOTHING;

-- ---------- 2. service_periods ----------
CREATE TABLE IF NOT EXISTS public.service_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.service_periods ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='service_periods' AND policyname='Authenticated can read service_periods') THEN
    CREATE POLICY "Authenticated can read service_periods" ON public.service_periods FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='service_periods' AND policyname='Authorized can manage service_periods') THEN
    CREATE POLICY "Authorized can manage service_periods" ON public.service_periods FOR ALL TO authenticated
      USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_service_periods_updated_at ON public.service_periods;
CREATE TRIGGER trg_service_periods_updated_at BEFORE UPDATE ON public.service_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 3. revenue_sources (table already exists from prior run) ----------
CREATE TABLE IF NOT EXISTS public.revenue_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.revenue_sources ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='revenue_sources' AND policyname='Authenticated can read revenue_sources') THEN
    CREATE POLICY "Authenticated can read revenue_sources" ON public.revenue_sources FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='revenue_sources' AND policyname='Authorized can manage revenue_sources') THEN
    CREATE POLICY "Authorized can manage revenue_sources" ON public.revenue_sources FOR ALL TO authenticated
      USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_revenue_sources_updated_at ON public.revenue_sources;
CREATE TRIGGER trg_revenue_sources_updated_at BEFORE UPDATE ON public.revenue_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 4. Add venue_id + legacy_venue_name everywhere ----------
ALTER TABLE public.sales_records
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_venue_name text,
  ADD COLUMN IF NOT EXISTS service_period_id uuid REFERENCES public.service_periods(id) ON DELETE SET NULL;
UPDATE public.sales_records sr SET venue_id = v.id, legacy_venue_name = COALESCE(sr.legacy_venue_name, sr.venue)
  FROM public.venues v WHERE v.name = sr.venue AND sr.venue_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_sales_records_venue_id ON public.sales_records(venue_id);
CREATE INDEX IF NOT EXISTS idx_sales_records_service_period_id ON public.sales_records(service_period_id);

ALTER TABLE public.forecasts
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_venue_name text;
UPDATE public.forecasts f SET venue_id = v.id, legacy_venue_name = COALESCE(f.legacy_venue_name, f.venue)
  FROM public.venues v WHERE v.name = f.venue AND f.venue_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_forecasts_venue_id ON public.forecasts(venue_id);

ALTER TABLE public.hr_employees
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_venue_name text;
UPDATE public.hr_employees e SET venue_id = v.id, legacy_venue_name = COALESCE(e.legacy_venue_name, e.venue)
  FROM public.venues v WHERE v.name = e.venue AND e.venue_id IS NULL AND e.venue IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hr_employees_venue_id ON public.hr_employees(venue_id);

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS linked_venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_linked_venue_name text;
UPDATE public.events e SET linked_venue_id = v.id, legacy_linked_venue_name = COALESCE(e.legacy_linked_venue_name, e.linked_venue)
  FROM public.venues v WHERE v.name = e.linked_venue AND e.linked_venue_id IS NULL AND e.linked_venue IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_linked_venue_id ON public.events(linked_venue_id);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_venue_name text;
UPDATE public.invoices i SET venue_id = v.id, legacy_venue_name = COALESCE(i.legacy_venue_name, i.venue)
  FROM public.venues v WHERE v.name = i.venue AND i.venue_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_venue_id ON public.invoices(venue_id);

ALTER TABLE public.inventory_periods
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_venue_name text;
UPDATE public.inventory_periods p SET venue_id = v.id, legacy_venue_name = COALESCE(p.legacy_venue_name, p.venue)
  FROM public.venues v WHERE v.name = p.venue AND p.venue_id IS NULL;

ALTER TABLE public.inventory_counts
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_venue_name text;
UPDATE public.inventory_counts c SET venue_id = v.id, legacy_venue_name = COALESCE(c.legacy_venue_name, c.venue)
  FROM public.venues v WHERE v.name = c.venue AND c.venue_id IS NULL;

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_venue_name text;
UPDATE public.bank_accounts b SET venue_id = v.id, legacy_venue_name = COALESCE(b.legacy_venue_name, b.venue)
  FROM public.venues v WHERE v.name = b.venue AND b.venue_id IS NULL AND b.venue IS NOT NULL;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_venue_name text;
UPDATE public.journal_entries j SET venue_id = v.id, legacy_venue_name = COALESCE(j.legacy_venue_name, j.venue)
  FROM public.venues v WHERE v.name = j.venue AND j.venue_id IS NULL AND j.venue IS NOT NULL;

ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_venue_name text;
UPDATE public.journal_lines l SET venue_id = v.id, legacy_venue_name = COALESCE(l.legacy_venue_name, l.venue)
  FROM public.venues v WHERE v.name = l.venue AND l.venue_id IS NULL AND l.venue IS NOT NULL;

-- ---------- 5. Cascade-rename trigger ----------
CREATE OR REPLACE FUNCTION public.cascade_venue_rename()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.sales_records      SET venue = NEW.name WHERE venue_id = NEW.id;
    UPDATE public.forecasts          SET venue = NEW.name WHERE venue_id = NEW.id;
    UPDATE public.hr_employees       SET venue = NEW.name WHERE venue_id = NEW.id;
    UPDATE public.events             SET linked_venue = NEW.name WHERE linked_venue_id = NEW.id;
    UPDATE public.invoices           SET venue = NEW.name WHERE venue_id = NEW.id;
    UPDATE public.inventory_periods  SET venue = NEW.name WHERE venue_id = NEW.id;
    UPDATE public.inventory_counts   SET venue = NEW.name WHERE venue_id = NEW.id;
    UPDATE public.bank_accounts      SET venue = NEW.name WHERE venue_id = NEW.id;
    UPDATE public.journal_entries    SET venue = NEW.name WHERE venue_id = NEW.id;
    UPDATE public.journal_lines      SET venue = NEW.name WHERE venue_id = NEW.id;

    UPDATE public.account_mapping_rules
       SET match_key = NEW.name
     WHERE rule_type IN ('sales_revenue','service_charge','sales_discount','tips_payable',
                         'payroll_salary_expense','payroll_mpf_expense')
       AND match_key = OLD.name;

    UPDATE public.account_mapping_rules
       SET match_key = split_part(match_key, '__', 1) || '__' || NEW.name
     WHERE rule_type = 'sales_payment_method'
       AND match_key LIKE '%\_\_' || OLD.name ESCAPE '\';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_venue_rename ON public.venues;
CREATE TRIGGER trg_cascade_venue_rename AFTER UPDATE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.cascade_venue_rename();

-- ---------- 6. Safe-delete on venues ----------
CREATE OR REPLACE FUNCTION public.guard_venue_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cnt int;
BEGIN
  IF OLD.is_system THEN
    RAISE EXCEPTION 'Cannot delete system venue "%". Deactivate it instead.', OLD.name;
  END IF;
  SELECT
    (SELECT COUNT(*) FROM public.sales_records      WHERE venue_id = OLD.id) +
    (SELECT COUNT(*) FROM public.forecasts          WHERE venue_id = OLD.id) +
    (SELECT COUNT(*) FROM public.hr_employees       WHERE venue_id = OLD.id) +
    (SELECT COUNT(*) FROM public.events             WHERE linked_venue_id = OLD.id) +
    (SELECT COUNT(*) FROM public.invoices           WHERE venue_id = OLD.id) +
    (SELECT COUNT(*) FROM public.inventory_periods  WHERE venue_id = OLD.id) +
    (SELECT COUNT(*) FROM public.bank_accounts      WHERE venue_id = OLD.id) +
    (SELECT COUNT(*) FROM public.journal_entries    WHERE venue_id = OLD.id)
  INTO cnt;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'Cannot delete venue "%": % records still reference it. Deactivate instead.', OLD.name, cnt;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_venue_delete ON public.venues;
CREATE TRIGGER trg_guard_venue_delete BEFORE DELETE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.guard_venue_delete();

-- ---------- 7. Safe-delete on service_periods ----------
CREATE OR REPLACE FUNCTION public.guard_service_period_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cnt int;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.sales_records WHERE service_period_id = OLD.id;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'Cannot delete service period "%": % sales records reference it. Deactivate instead.', OLD.name, cnt;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_service_period_delete ON public.service_periods;
CREATE TRIGGER trg_guard_service_period_delete BEFORE DELETE ON public.service_periods
  FOR EACH ROW EXECUTE FUNCTION public.guard_service_period_delete();
