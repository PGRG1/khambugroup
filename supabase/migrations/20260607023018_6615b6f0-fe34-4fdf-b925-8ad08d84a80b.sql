
-- KPI Management module: cards, targets, assignments, manual actuals, follow-up actions
CREATE TABLE public.kpi_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_name text NOT NULL,
  kpi_category text NOT NULL DEFAULT 'revenue',
  kpi_type text NOT NULL DEFAULT 'custom',
  unit text NOT NULL DEFAULT 'currency',
  description text DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_cards TO authenticated;
GRANT ALL ON public.kpi_cards TO service_role;
ALTER TABLE public.kpi_cards ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.kpi_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_card_id uuid NOT NULL REFERENCES public.kpi_cards(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_role text,
  target_value numeric NOT NULL DEFAULT 0,
  target_period text NOT NULL DEFAULT 'day',
  period_start_date date,
  period_end_date date,
  calculation_method text NOT NULL DEFAULT 'manual',
  day_of_week smallint,
  warning_threshold_pct numeric NOT NULL DEFAULT 10,
  critical_threshold_pct numeric NOT NULL DEFAULT 20,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_targets TO authenticated;
GRANT ALL ON public.kpi_targets TO service_role;
ALTER TABLE public.kpi_targets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.kpi_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_card_id uuid NOT NULL REFERENCES public.kpi_cards(id) ON DELETE CASCADE,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_role text,
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_assignments TO authenticated;
GRANT ALL ON public.kpi_assignments TO service_role;
ALTER TABLE public.kpi_assignments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_kpi_assignments_user ON public.kpi_assignments(assigned_user_id) WHERE active;
CREATE INDEX idx_kpi_assignments_card ON public.kpi_assignments(kpi_card_id);

CREATE TABLE public.kpi_actuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_card_id uuid NOT NULL REFERENCES public.kpi_cards(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  period_date date NOT NULL,
  actual_value numeric NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  actual_source text NOT NULL DEFAULT 'manual',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kpi_card_id, venue_id, period_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_actuals TO authenticated;
GRANT ALL ON public.kpi_actuals TO service_role;
ALTER TABLE public.kpi_actuals ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.kpi_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_card_id uuid NOT NULL REFERENCES public.kpi_cards(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  period_date date,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action_required text NOT NULL DEFAULT '',
  action_status text NOT NULL DEFAULT 'open',
  due_date date,
  completed_date date,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_actions TO authenticated;
GRANT ALL ON public.kpi_actions TO service_role;
ALTER TABLE public.kpi_actions ENABLE ROW LEVEL SECURITY;

-- Helper: does the user own (or share) responsibility for a KPI card?
CREATE OR REPLACE FUNCTION public.user_owns_kpi(_user_id uuid, _kpi_card_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kpi_assignments
    WHERE kpi_card_id = _kpi_card_id
      AND active = true
      AND (assigned_user_id = _user_id OR assigned_user_id IS NULL)
  );
$$;

-- RLS: admins full access; users read cards/targets/assignments/actuals/actions for cards they own
-- kpi_cards
CREATE POLICY "Admins manage kpi_cards" ON public.kpi_cards
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Users read active kpi_cards they own" ON public.kpi_cards
  FOR SELECT TO authenticated
  USING (active = true AND public.user_owns_kpi(auth.uid(), id));

-- kpi_targets
CREATE POLICY "Admins manage kpi_targets" ON public.kpi_targets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Users read kpi_targets for owned cards" ON public.kpi_targets
  FOR SELECT TO authenticated
  USING (public.user_owns_kpi(auth.uid(), kpi_card_id));

-- kpi_assignments
CREATE POLICY "Admins manage kpi_assignments" ON public.kpi_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Users read own kpi_assignments" ON public.kpi_assignments
  FOR SELECT TO authenticated
  USING (assigned_user_id = auth.uid() OR assigned_user_id IS NULL);

-- kpi_actuals
CREATE POLICY "Admins manage kpi_actuals" ON public.kpi_actuals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Users read kpi_actuals for owned cards" ON public.kpi_actuals
  FOR SELECT TO authenticated
  USING (public.user_owns_kpi(auth.uid(), kpi_card_id));
CREATE POLICY "Users insert kpi_actuals for owned cards" ON public.kpi_actuals
  FOR INSERT TO authenticated
  WITH CHECK (public.user_owns_kpi(auth.uid(), kpi_card_id));
CREATE POLICY "Users update kpi_actuals for owned cards" ON public.kpi_actuals
  FOR UPDATE TO authenticated
  USING (public.user_owns_kpi(auth.uid(), kpi_card_id))
  WITH CHECK (public.user_owns_kpi(auth.uid(), kpi_card_id));

-- kpi_actions
CREATE POLICY "Admins manage kpi_actions" ON public.kpi_actions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Users read kpi_actions for owned cards" ON public.kpi_actions
  FOR SELECT TO authenticated
  USING (public.user_owns_kpi(auth.uid(), kpi_card_id));
CREATE POLICY "Users update kpi_actions for owned cards" ON public.kpi_actions
  FOR UPDATE TO authenticated
  USING (public.user_owns_kpi(auth.uid(), kpi_card_id))
  WITH CHECK (public.user_owns_kpi(auth.uid(), kpi_card_id));

-- updated_at triggers
CREATE TRIGGER trg_kpi_cards_updated BEFORE UPDATE ON public.kpi_cards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_kpi_targets_updated BEFORE UPDATE ON public.kpi_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_kpi_assignments_updated BEFORE UPDATE ON public.kpi_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_kpi_actuals_updated BEFORE UPDATE ON public.kpi_actuals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_kpi_actions_updated BEFORE UPDATE ON public.kpi_actions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Page permission keys for KPI module
INSERT INTO public.user_page_permissions (user_id, page_key)
SELECT id, 'kpis' FROM auth.users ON CONFLICT (user_id, page_key) DO NOTHING;
INSERT INTO public.user_page_permissions (user_id, page_key)
SELECT id, 'kpi-management' FROM auth.users ON CONFLICT (user_id, page_key) DO NOTHING;

-- Update new-user trigger to include the new page keys
CREATE OR REPLACE FUNCTION public.handle_new_user_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_access_control (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_page_permissions (user_id, page_key)
  VALUES 
    (NEW.id, 'revenue'),
    (NEW.id, 'forecast'),
    (NEW.id, 'data'),
    (NEW.id, 'activity-log'),
    (NEW.id, 'pl-report'),
    (NEW.id, 'invoices'),
    (NEW.id, 'inventory'),
    (NEW.id, 'notifications'),
    (NEW.id, 'kpis'),
    (NEW.id, 'kpi-management')
  ON CONFLICT (user_id, page_key) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Seed initial KPI cards
INSERT INTO public.kpi_cards (kpi_name, kpi_category, kpi_type, unit, description) VALUES
  ('Month-to-Date Revenue Target', 'revenue', 'mtd_revenue', 'currency', 'Monthly revenue target vs achieved'),
  ('Daily Revenue Target', 'revenue', 'daily_revenue', 'currency', 'Today''s revenue target vs achieved'),
  ('Daily Guest Count Target', 'revenue', 'daily_guests', 'count', 'Today''s guest count target'),
  ('Daily Per Guest Spend Target', 'revenue', 'daily_per_guest_spend', 'currency', 'Revenue divided by guests');
