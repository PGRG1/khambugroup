
-- Multi-tenancy fix: revenue_sources.name must be unique per tenant, not globally
ALTER TABLE public.revenue_sources DROP CONSTRAINT IF EXISTS revenue_sources_name_key;
ALTER TABLE public.revenue_sources
  ADD CONSTRAINT revenue_sources_tenant_name_key UNIQUE (tenant_id, name);

CREATE TABLE public.manual_revenue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  description text NOT NULL DEFAULT '',
  revenue_source_id uuid REFERENCES public.revenue_sources(id) ON DELETE SET NULL,
  receipt_url text,
  receipt_path text,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_revenue_entries TO authenticated;
GRANT ALL ON public.manual_revenue_entries TO service_role;

ALTER TABLE public.manual_revenue_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant read manual_revenue_entries"
  ON public.manual_revenue_entries FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "tenant write manual_revenue_entries"
  ON public.manual_revenue_entries FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

CREATE TRIGGER manual_revenue_entries_touch_updated_at
  BEFORE UPDATE ON public.manual_revenue_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_manual_revenue_entries_tenant_date
  ON public.manual_revenue_entries(tenant_id, entry_date DESC);

UPDATE public.revenue_sources
   SET is_active = true
 WHERE name IN ('Events','Delivery','Takeaway','Catering','Private Dining','Pop-up / Stall','Other');

INSERT INTO public.revenue_sources (tenant_id, name, description, sort_order, is_active)
SELECT t.id, 'Other Income', 'Miscellaneous / non-operational income', 900, true
  FROM public.tenants t
 WHERE NOT EXISTS (
   SELECT 1 FROM public.revenue_sources rs
    WHERE rs.tenant_id = t.id AND rs.name = 'Other Income'
 );
