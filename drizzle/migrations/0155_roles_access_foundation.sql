CREATE TABLE public.tenant_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role_key text NOT NULL CHECK (role_key IN ('owner','operations_manager','general_manager','assistant_manager','head_chef','bar_manager','finance','front_of_house','back_of_house')),
  name text NOT NULL,
  money text NOT NULL CHECK (money IN ('nothing','sales','costs','sales_costs','everything')),
  revenue smallint NOT NULL CHECK (revenue BETWEEN 0 AND 3),
  purchasing smallint NOT NULL CHECK (purchasing BETWEEN 0 AND 3),
  stock smallint NOT NULL CHECK (stock BETWEEN 0 AND 3),
  people smallint NOT NULL CHECK (people BETWEEN 0 AND 3),
  payroll smallint NOT NULL CHECK (payroll BETWEEN 0 AND 3),
  expenses smallint NOT NULL CHECK (expenses BETWEEN 0 AND 3),
  finance smallint NOT NULL CHECK (finance BETWEEN 0 AND 3),
  settings smallint NOT NULL CHECK (settings BETWEEN 0 AND 3),
  job_titles text[] NOT NULL DEFAULT '{}',
  sort_order int NOT NULL DEFAULT 0,
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role_key)
);
GRANT SELECT ON public.tenant_roles TO authenticated;
GRANT ALL ON public.tenant_roles TO service_role;
ALTER TABLE public.tenant_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read roles" ON public.tenant_roles FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(), tenant_id));

CREATE TABLE public.tenant_user_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role_key text,
  all_venues boolean NOT NULL DEFAULT true,
  employee_id uuid REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  reports_to uuid,
  status text NOT NULL DEFAULT 'review_needed' CHECK (status IN ('active','suspended','review_needed','removed')),
  mapping_note text,
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id),
  FOREIGN KEY (tenant_id, role_key) REFERENCES public.tenant_roles(tenant_id, role_key),
  CHECK (reports_to IS NULL OR reports_to <> user_id),
  CHECK (status <> 'active' OR role_key IS NOT NULL)
);
GRANT SELECT ON public.tenant_user_access TO authenticated;
GRANT ALL ON public.tenant_user_access TO service_role;
ALTER TABLE public.tenant_user_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read access" ON public.tenant_user_access FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(), tenant_id));

CREATE TABLE public.tenant_user_venues (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, venue_id)
);
GRANT SELECT ON public.tenant_user_venues TO authenticated;
GRANT ALL ON public.tenant_user_venues TO service_role;
ALTER TABLE public.tenant_user_venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read venue access" ON public.tenant_user_venues FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(), tenant_id));

CREATE TABLE public.tenant_user_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  area text NOT NULL CHECK (area IN ('revenue','purchasing','stock','people','payroll','expenses','finance','settings','money')),
  level smallint CHECK (level BETWEEN 0 AND 3),
  money text CHECK (money IN ('nothing','sales','costs','sales_costs','everything')),
  reason text NOT NULL,
  set_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, area),
  CHECK ((area = 'money') = (money IS NOT NULL) AND (area = 'money') = (level IS NULL))
);
GRANT SELECT ON public.tenant_user_exceptions TO authenticated;
GRANT ALL ON public.tenant_user_exceptions TO service_role;
ALTER TABLE public.tenant_user_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read exceptions" ON public.tenant_user_exceptions FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(), tenant_id));

CREATE TABLE public.tenant_access_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid,
  changed_by uuid,
  change text NOT NULL,
  before jsonb, after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tenant_access_changes TO authenticated;
GRANT ALL ON public.tenant_access_changes TO service_role;
ALTER TABLE public.tenant_access_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read access history" ON public.tenant_access_changes FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id, auth.uid()));

-- Default role set (editable per tenant; Owner stays full)
CREATE OR REPLACE FUNCTION public.seed_tenant_roles(t uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.tenant_roles(tenant_id,role_key,name,money,revenue,purchasing,stock,people,payroll,expenses,finance,settings,job_titles,sort_order) VALUES
  (t,'owner','Owner','everything',3,3,3,3,3,3,3,2,'{}',1),
  (t,'operations_manager','Operations manager','sales_costs',3,3,2,3,1,3,1,0,'{}',2),
  (t,'general_manager','General manager','sales_costs',2,3,2,3,0,2,0,0,'{"General Manager","Manager"}',3),
  (t,'assistant_manager','Assistant manager','sales',1,2,2,2,0,0,0,0,'{"Assistant Manager"}',4),
  (t,'head_chef','Head chef','costs',0,3,2,2,0,0,0,0,'{}',5),
  (t,'bar_manager','Bar manager','costs',0,3,2,2,0,0,0,0,'{"Bar Manager"}',6),
  (t,'finance','Finance','everything',1,1,1,0,2,3,2,1,'{}',7),
  (t,'front_of_house','Front of house','nothing',0,0,0,0,0,0,0,0,'{"Bar & Floor","Bartender","Bartender / Server","Server","Floor Attendant","Runner","Promoter","Promoters","Promotor","Shisha Attendant"}',8),
  (t,'back_of_house','Back of house','nothing',0,0,1,0,0,0,0,0,'{"Senior Cook","Cook","Demi Chef","Cook / Runner","Dish Washer","Dishwasher","Cleaner"}',9)
  ON CONFLICT (tenant_id, role_key) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.seed_tenant_roles(uuid) FROM public, anon, authenticated;
SELECT public.seed_tenant_roles(id) FROM public.tenants;

CREATE OR REPLACE FUNCTION public.tenant_roles_seed_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN PERFORM public.seed_tenant_roles(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER tenants_seed_roles AFTER INSERT ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.tenant_roles_seed_trigger();

CREATE OR REPLACE FUNCTION public.tenant_roles_guard() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Standard roles cannot be deleted'; END IF;
  IF NEW.role_key = 'owner' AND (NEW.money <> 'everything' OR LEAST(NEW.revenue,NEW.purchasing,NEW.stock,NEW.people,NEW.payroll,NEW.expenses,NEW.finance) < 3 OR NEW.settings < 2) THEN
    RAISE EXCEPTION 'The Owner role always keeps full access'; END IF;
  NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER tenant_roles_guard BEFORE UPDATE OR DELETE ON public.tenant_roles FOR EACH ROW EXECUTE FUNCTION public.tenant_roles_guard();

-- Single source of truth. Falls back to today's behaviour until a person has an active role.
CREATE OR REPLACE FUNCTION public.access_level(t uuid, area text) RETURNS smallint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.tenant_user_access; r public.tenant_roles; x smallint; base smallint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_tenant(auth.uid(), t) THEN RETURN 0; END IF;
  SELECT * INTO a FROM public.tenant_user_access WHERE tenant_id=t AND user_id=auth.uid();
  IF a.id IS NULL OR a.status = 'review_needed' THEN
    RETURN CASE WHEN public.is_tenant_admin(t, auth.uid()) THEN 3 ELSE 2 END;
  END IF;
  IF a.status IN ('suspended','removed') THEN RETURN 0; END IF;
  SELECT * INTO r FROM public.tenant_roles WHERE tenant_id=t AND role_key=a.role_key;
  base := CASE area WHEN 'revenue' THEN r.revenue WHEN 'purchasing' THEN r.purchasing WHEN 'stock' THEN r.stock WHEN 'people' THEN r.people
    WHEN 'payroll' THEN r.payroll WHEN 'expenses' THEN r.expenses WHEN 'finance' THEN r.finance WHEN 'settings' THEN r.settings ELSE 0 END;
  SELECT level INTO x FROM public.tenant_user_exceptions WHERE tenant_id=t AND user_id=auth.uid() AND tenant_user_exceptions.area=access_level.area;
  RETURN COALESCE(x, base, 0);
END $$;

CREATE OR REPLACE FUNCTION public.money_level(t uuid) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.tenant_user_access; m text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_tenant(auth.uid(), t) THEN RETURN 'nothing'; END IF;
  SELECT * INTO a FROM public.tenant_user_access WHERE tenant_id=t AND user_id=auth.uid();
  IF a.id IS NULL OR a.status = 'review_needed' THEN RETURN 'everything'; END IF;
  IF a.status IN ('suspended','removed') THEN RETURN 'nothing'; END IF;
  SELECT money INTO m FROM public.tenant_user_exceptions WHERE tenant_id=t AND user_id=auth.uid() AND area='money';
  RETURN COALESCE(m, (SELECT money FROM public.tenant_roles WHERE tenant_id=t AND role_key=a.role_key), 'nothing');
END $$;

CREATE OR REPLACE FUNCTION public.can_see_venue(t uuid, v uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.tenant_user_access;
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_tenant(auth.uid(), t) THEN RETURN false; END IF;
  SELECT * INTO a FROM public.tenant_user_access WHERE tenant_id=t AND user_id=auth.uid();
  IF a.id IS NULL OR a.status = 'review_needed' THEN RETURN v IS NULL OR public.user_has_venue(auth.uid(), v); END IF;
  IF a.status IN ('suspended','removed') THEN RETURN false; END IF;
  RETURN a.all_venues OR v IS NULL OR EXISTS (SELECT 1 FROM public.tenant_user_venues WHERE tenant_id=t AND user_id=auth.uid() AND venue_id=v);
END $$;

CREATE OR REPLACE FUNCTION public.is_owner(t uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((SELECT role_key='owner' AND status='active' FROM public.tenant_user_access WHERE tenant_id=t AND user_id=auth.uid()), public.is_tenant_admin(t, auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.access_level(uuid,text), public.money_level(uuid), public.can_see_venue(uuid,uuid), public.is_owner(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.access_level(uuid,text), public.money_level(uuid), public.can_see_venue(uuid,uuid), public.is_owner(uuid) TO authenticated, service_role;
CREATE INDEX ON public.tenant_user_venues(user_id);