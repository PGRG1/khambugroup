-- Deals are set up on Master data: an item deal on a product (buy X get Y free, or a discount) and a rebate on a
-- supplier (money back over a spend, a % or a fixed amount, counted monthly / quarterly / yearly).

-- 1. Item deals can also be a discount: % off or a special price.
ALTER TABLE public.item_supplier_deals DROP CONSTRAINT IF EXISTS item_supplier_deals_deal_type_check;
ALTER TABLE public.item_supplier_deals DROP CONSTRAINT IF EXISTS item_supplier_deals_buy_qty_check;
ALTER TABLE public.item_supplier_deals DROP CONSTRAINT IF EXISTS item_supplier_deals_free_qty_check;
ALTER TABLE public.item_supplier_deals ALTER COLUMN buy_qty DROP NOT NULL, ALTER COLUMN free_qty DROP NOT NULL;
ALTER TABLE public.item_supplier_deals ADD COLUMN IF NOT EXISTS discount_percent numeric CHECK (discount_percent IS NULL OR (discount_percent > 0 AND discount_percent < 100));
ALTER TABLE public.item_supplier_deals ADD COLUMN IF NOT EXISTS special_price numeric CHECK (special_price IS NULL OR special_price >= 0);
ALTER TABLE public.item_supplier_deals ADD CONSTRAINT item_supplier_deals_deal_type_check CHECK (
  (deal_type = 'buy_x_get_y_free' AND coalesce(buy_qty, 0) > 0 AND coalesce(free_qty, 0) > 0)
  OR (deal_type = 'discount' AND ((discount_percent IS NOT NULL) <> (special_price IS NOT NULL))));

-- 2. Supplier rebates.
CREATE TABLE IF NOT EXISTS public.supplier_rebates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  threshold numeric NOT NULL CHECK (threshold > 0),
  basis text NOT NULL CHECK (basis IN ('percent','fixed')),
  value numeric NOT NULL CHECK (value > 0),
  period text NOT NULL CHECK (period IN ('monthly','quarterly','yearly')),
  starts_on date NOT NULL,
  ends_on date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (basis <> 'percent' OR value < 100),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS supplier_rebates_tenant ON public.supplier_rebates (tenant_id, supplier_id) WHERE is_active;
ALTER TABLE public.supplier_rebates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "supplier_rebates read" ON public.supplier_rebates;
CREATE POLICY "supplier_rebates read" ON public.supplier_rebates FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
-- Same people who keep the pre-approved item list (Bani, business admin, Approve on Purchasing or Finance).
DROP POLICY IF EXISTS "supplier_rebates write" ON public.supplier_rebates;
CREATE POLICY "supplier_rebates write" ON public.supplier_rebates FOR ALL TO authenticated
  USING (public.can_edit_item_list(tenant_id)) WITH CHECK (public.can_edit_item_list(tenant_id));
