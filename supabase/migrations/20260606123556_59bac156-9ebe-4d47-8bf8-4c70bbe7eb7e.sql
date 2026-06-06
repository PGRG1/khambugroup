
-- push_subscriptions
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  enabled_daily_pulse boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own subscriptions" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins read all subscriptions" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions(user_id);

-- alert_rules
CREATE TABLE public.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  metric text NOT NULL,
  venue text,
  operator text NOT NULL CHECK (operator IN ('lt','lte','gt','gte')),
  threshold numeric NOT NULL,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  audience_roles text[] NOT NULL DEFAULT ARRAY['admin','manager'],
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_rules TO authenticated;
GRANT ALL ON public.alert_rules TO service_role;
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own & global rules" ON public.alert_rules
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Users insert own rules" ON public.alert_rules
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR (user_id IS NULL AND public.has_role(auth.uid(), 'admin'::public.app_role)));
CREATE POLICY "Users update own rules" ON public.alert_rules
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Users delete own rules" ON public.alert_rules
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER set_alert_rules_updated_at BEFORE UPDATE ON public.alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- alert_events
CREATE TABLE public.alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.alert_rules(id) ON DELETE CASCADE,
  fired_for_date date NOT NULL,
  metric_value numeric,
  threshold numeric,
  severity text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rule_id, fired_for_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_events TO authenticated;
GRANT ALL ON public.alert_events TO service_role;
ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read events for visible rules" ON public.alert_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.alert_rules r
    WHERE r.id = alert_events.rule_id
      AND (r.user_id = auth.uid() OR r.user_id IS NULL OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));
CREATE INDEX idx_alert_events_rule_date ON public.alert_events(rule_id, fired_for_date DESC);

-- Update handle_new_user_access to seed 'notifications' page key
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
    (NEW.id, 'notifications')
  ON CONFLICT (user_id, page_key) DO NOTHING;
  
  RETURN NEW;
END;
$function$;

-- Backfill notifications permission for existing users
INSERT INTO public.user_page_permissions (user_id, page_key)
SELECT DISTINCT user_id, 'notifications' FROM public.user_page_permissions
ON CONFLICT (user_id, page_key) DO NOTHING;
