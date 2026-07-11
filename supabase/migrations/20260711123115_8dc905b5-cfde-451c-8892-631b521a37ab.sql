
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  legal_name text,
  registration_number text,
  incorporation_date date,
  registered_address text,
  auditor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_organizations_tenant_id ON public.organizations(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read organizations"
  ON public.organizations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized can manage organizations"
  ON public.organizations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR is_platform_admin(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR is_platform_admin(auth.uid()));

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.venues
  ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX idx_venues_organization_id ON public.venues(organization_id);

ALTER TABLE public.bank_accounts
  ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
CREATE INDEX idx_bank_accounts_organization_id ON public.bank_accounts(organization_id);

DO $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-00000000beef';
  v_a uuid; v_b uuid; v_c uuid;
BEGIN
  INSERT INTO public.organizations (tenant_id, name) VALUES (v_tenant, 'Entity A') RETURNING id INTO v_a;
  INSERT INTO public.organizations (tenant_id, name) VALUES (v_tenant, 'Entity B') RETURNING id INTO v_b;
  INSERT INTO public.organizations (tenant_id, name) VALUES (v_tenant, 'Entity C') RETURNING id INTO v_c;

  UPDATE public.venues SET organization_id = v_a WHERE tenant_id = v_tenant AND name IN ('Assembly','Caliente');
  UPDATE public.venues SET organization_id = v_b WHERE tenant_id = v_tenant AND name = 'Hanabi';
  UPDATE public.venues SET organization_id = v_c WHERE tenant_id = v_tenant AND name = 'Arca';

  UPDATE public.bank_accounts SET organization_id = v_a
    WHERE tenant_id = v_tenant AND organization_id IS NULL;
END $$;
