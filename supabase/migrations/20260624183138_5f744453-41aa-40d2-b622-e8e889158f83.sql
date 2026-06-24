
CREATE TABLE public.item_supplier_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.product_master(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  deal_type text NOT NULL DEFAULT 'buy_x_get_y_free' CHECK (deal_type IN ('buy_x_get_y_free')),
  buy_qty numeric(10,2) NOT NULL CHECK (buy_qty > 0),
  free_qty numeric(10,2) NOT NULL CHECK (free_qty > 0),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, supplier_id, deal_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_supplier_deals TO authenticated;
GRANT ALL ON public.item_supplier_deals TO service_role;

ALTER TABLE public.item_supplier_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select ON public.item_supplier_deals
  FOR SELECT USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY tenant_write ON public.item_supplier_deals
  FOR ALL USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE TRIGGER update_item_supplier_deals_updated_at
  BEFORE UPDATE ON public.item_supplier_deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_item_supplier_deals_product ON public.item_supplier_deals(product_id) WHERE is_active;
CREATE INDEX idx_item_supplier_deals_tenant ON public.item_supplier_deals(tenant_id);
