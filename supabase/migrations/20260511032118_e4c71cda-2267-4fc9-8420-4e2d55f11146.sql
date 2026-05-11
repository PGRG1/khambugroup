
-- ============ TENANTS ============
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.tenants (id, name, slug)
VALUES ('00000000-0000-0000-0000-00000000beef', 'KHAMBU', 'khambu');

CREATE TABLE public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('super_admin','tenant_admin','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX idx_tenant_members_user ON public.tenant_members(user_id);
CREATE INDEX idx_tenant_members_tenant ON public.tenant_members(tenant_id);

-- Backfill: every existing auth user → KHAMBU tenant
INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT '00000000-0000-0000-0000-00000000beef', u.id,
       CASE WHEN EXISTS (SELECT 1 FROM public.user_roles ur
                         WHERE ur.user_id = u.id AND ur.role = 'admin')
            THEN 'tenant_admin' ELSE 'member' END
FROM auth.users u
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _tenant_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(_tenant_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _tenant_id AND user_id = _user_id
      AND role IN ('tenant_admin','super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE user_id = _user_id AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.tenant_members
  WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'super_admin' THEN 0 WHEN 'tenant_admin' THEN 1 ELSE 2 END
  LIMIT 1;
$$;

-- ============ TENANT RLS ============
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants visible to members"
  ON public.tenants FOR SELECT TO authenticated
  USING (public.is_tenant_member(id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "tenants editable by super admin"
  ON public.tenants FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "tenant members visible to members"
  ON public.tenant_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_tenant_admin(tenant_id, auth.uid())
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "tenant members managed by tenant admin"
  ON public.tenant_members FOR ALL TO authenticated
  USING (public.is_tenant_admin(tenant_id, auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_tenant_admin(tenant_id, auth.uid()) OR public.is_super_admin(auth.uid()));

-- Auto-add new signups to default tenant
CREATE OR REPLACE FUNCTION public.handle_new_user_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES ('00000000-0000-0000-0000-00000000beef', NEW.id, 'member')
  ON CONFLICT (tenant_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_tenant ON auth.users;
CREATE TRIGGER on_auth_user_created_tenant
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_tenant();

-- ============ AI LEARNED RULES ============
CREATE TABLE public.ai_learned_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  venue_id uuid NULL,
  domain text NOT NULL,
  workflow text NOT NULL,
  rule_type text NULL,
  name text NULL,
  input_pattern jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_action jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(4,3) NOT NULL DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  hit_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz NULL,
  source_examples jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','needs_review')),
  created_by uuid NULL,
  reviewed_by uuid NULL,
  reviewed_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_rules_lookup ON public.ai_learned_rules(tenant_id, domain, workflow, status);
CREATE INDEX idx_ai_rules_venue ON public.ai_learned_rules(tenant_id, venue_id);
CREATE INDEX idx_ai_rules_input_gin ON public.ai_learned_rules USING GIN (input_pattern);

CREATE TRIGGER trg_ai_rules_updated_at
  BEFORE UPDATE ON public.ai_learned_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_learned_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai rules read by tenant members"
  ON public.ai_learned_rules FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "ai rules managed by tenant admin"
  ON public.ai_learned_rules FOR ALL TO authenticated
  USING (public.is_tenant_admin(tenant_id, auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_tenant_admin(tenant_id, auth.uid()) OR public.is_super_admin(auth.uid()));

-- ============ HISTORY ============
CREATE TABLE public.ai_learned_rules_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  change_type text NOT NULL CHECK (change_type IN ('insert','update','delete')),
  changed_by uuid NULL,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_rules_history_rule ON public.ai_learned_rules_history(rule_id);
CREATE INDEX idx_ai_rules_history_tenant ON public.ai_learned_rules_history(tenant_id, changed_at DESC);

ALTER TABLE public.ai_learned_rules_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai rules history read by tenant members"
  ON public.ai_learned_rules_history FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_ai_rule_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ai_learned_rules_history (rule_id, tenant_id, change_type, changed_by, snapshot)
    VALUES (NEW.id, NEW.tenant_id, 'insert', auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.ai_learned_rules_history (rule_id, tenant_id, change_type, changed_by, diff, snapshot)
    VALUES (NEW.id, NEW.tenant_id, 'update', auth.uid(),
            jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)),
            to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.ai_learned_rules_history (rule_id, tenant_id, change_type, changed_by, snapshot)
    VALUES (OLD.id, OLD.tenant_id, 'delete', auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_ai_rules_history
  AFTER INSERT OR UPDATE OR DELETE ON public.ai_learned_rules
  FOR EACH ROW EXECUTE FUNCTION public.log_ai_rule_change();

-- ============ APPLICATIONS LOG ============
CREATE TABLE public.ai_rule_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NULL REFERENCES public.ai_learned_rules(id) ON DELETE SET NULL,
  tenant_id uuid NOT NULL,
  domain text NOT NULL,
  workflow text NOT NULL,
  record_type text NULL,
  record_id text NULL,
  applied_by uuid NULL,
  was_overridden boolean NOT NULL DEFAULT false,
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_apps_rule ON public.ai_rule_applications(rule_id);
CREATE INDEX idx_ai_apps_lookup ON public.ai_rule_applications(tenant_id, domain, workflow, created_at DESC);

ALTER TABLE public.ai_rule_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai apps read by tenant members"
  ON public.ai_rule_applications FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "ai apps insertable by tenant members"
  ON public.ai_rule_applications FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()) OR public.is_super_admin(auth.uid()));

-- ============ MIGRATE EXISTING bank_recon_rules ============
INSERT INTO public.ai_learned_rules
  (tenant_id, domain, workflow, rule_type, name, input_pattern, output_action,
   confidence, status, created_at, updated_at)
SELECT
  '00000000-0000-0000-0000-00000000beef',
  'bank_recon',
  'bank_txn_classify',
  COALESCE(suggested_type, 'classify'),
  name,
  jsonb_build_object('match_contains', match_contains),
  jsonb_build_object(
    'suggested_type', suggested_type,
    'suggested_category', suggested_category
  ),
  0.9,
  CASE WHEN is_active THEN 'active' ELSE 'disabled' END,
  created_at,
  created_at
FROM public.bank_recon_rules;
