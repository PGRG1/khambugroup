CREATE TABLE IF NOT EXISTS public.sales_report_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  printed_name text NOT NULL CHECK (length(btrim(printed_name)) BETWEEN 1 AND 120),
  kind text NOT NULL CHECK (kind IN (
    'total','subtotal','guests','orders','service_charge','discount','tip',
    'sales','payment','delivery','voucher_sold','voucher_used','deposit_taken','deposit_used','ignore')),
  category text CHECK (category IN ('food','bev_alc','bev_non','dessert','other')),
  settles_to text CHECK (settles_to IN ('bank','cash')),
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  gl_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  legacy_field text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_report_lines_category_only_sales CHECK ((kind = 'sales') = (category IS NOT NULL)),
  CONSTRAINT sales_report_lines_settles_only_payments CHECK (settles_to IS NULL OR kind = 'payment')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_report_lines TO authenticated;
GRANT ALL ON public.sales_report_lines TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS sales_report_lines_unique_name
  ON public.sales_report_lines (tenant_id, COALESCE(venue_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(printed_name)));
CREATE INDEX IF NOT EXISTS sales_report_lines_tenant_venue ON public.sales_report_lines (tenant_id, venue_id);

CREATE TABLE IF NOT EXISTS public.sales_report_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  sample_count integer NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  confirmed_by uuid,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_report_setups TO authenticated;
GRANT ALL ON public.sales_report_setups TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS sales_report_setups_unique_scope
  ON public.sales_report_setups (tenant_id, COALESCE(venue_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE public.sales_report_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_report_setups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales report lines readable" ON public.sales_report_lines;
CREATE POLICY "sales report lines readable" ON public.sales_report_lines FOR SELECT TO authenticated
  USING (public.user_has_tenant(auth.uid(), tenant_id) OR public.is_platform_admin());
DROP POLICY IF EXISTS "sales report lines platform write" ON public.sales_report_lines;
CREATE POLICY "sales report lines platform write" ON public.sales_report_lines FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
DROP POLICY IF EXISTS "sales report setups readable" ON public.sales_report_setups;
CREATE POLICY "sales report setups readable" ON public.sales_report_setups FOR SELECT TO authenticated
  USING (public.user_has_tenant(auth.uid(), tenant_id) OR public.is_platform_admin());
DROP POLICY IF EXISTS "sales report setups platform write" ON public.sales_report_setups;
CREATE POLICY "sales report setups platform write" ON public.sales_report_setups FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());