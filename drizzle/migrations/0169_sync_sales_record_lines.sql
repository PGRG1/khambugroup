CREATE TABLE IF NOT EXISTS public.sales_record_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sales_record_id uuid NOT NULL REFERENCES public.sales_records(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  line_id uuid REFERENCES public.sales_report_lines(id) ON DELETE SET NULL,
  printed_name text NOT NULL CHECK (length(btrim(printed_name)) BETWEEN 1 AND 120),
  amount numeric(14,2) NOT NULL,
  source text NOT NULL DEFAULT 'fields' CHECK (source IN ('fields','receipt','manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_record_lines_unique_name ON public.sales_record_lines (sales_record_id, lower(btrim(printed_name)));
CREATE INDEX IF NOT EXISTS sales_record_lines_tenant_record ON public.sales_record_lines (tenant_id, sales_record_id);
CREATE INDEX IF NOT EXISTS sales_record_lines_line ON public.sales_record_lines (line_id);
GRANT SELECT ON public.sales_record_lines TO authenticated;
GRANT ALL ON public.sales_record_lines TO service_role;
ALTER TABLE public.sales_record_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales record lines readable" ON public.sales_record_lines;
CREATE POLICY "sales record lines readable" ON public.sales_record_lines FOR SELECT TO authenticated
  USING (public.access_level(tenant_id, 'revenue') >= 1 AND public.can_see_venue(tenant_id, venue_id));

DROP POLICY IF EXISTS "sales report lines readable" ON public.sales_report_lines;
CREATE POLICY "sales report lines readable" ON public.sales_report_lines FOR SELECT TO authenticated
  USING (public.access_level(tenant_id, 'revenue') >= 1 OR public.is_platform_admin());
DROP POLICY IF EXISTS "sales report setups readable" ON public.sales_report_setups;
CREATE POLICY "sales report setups readable" ON public.sales_report_setups FOR SELECT TO authenticated
  USING (public.access_level(tenant_id, 'revenue') >= 1 OR public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.sync_sales_record_lines() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE use_venue boolean;
BEGIN
  use_venue := NEW.venue_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sales_report_lines o WHERE o.tenant_id = NEW.tenant_id AND o.venue_id = NEW.venue_id AND o.is_active);
  DELETE FROM public.sales_record_lines l WHERE l.sales_record_id = NEW.id AND l.source = 'fields';
  INSERT INTO public.sales_record_lines (tenant_id, sales_record_id, venue_id, line_id, printed_name, amount, source)
  SELECT NEW.tenant_id, NEW.id, NEW.venue_id, s.id, s.printed_name, v.amount, 'fields'
  FROM public.sales_report_lines s
  CROSS JOIN LATERAL (SELECT NULLIF(to_jsonb(NEW) ->> s.legacy_field, '')::numeric AS amount) v
  WHERE s.tenant_id = NEW.tenant_id AND s.is_active AND s.legacy_field IS NOT NULL
    AND (CASE WHEN use_venue THEN s.venue_id = NEW.venue_id ELSE s.venue_id IS NULL END)
    AND v.amount IS NOT NULL AND v.amount <> 0
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_sales_record_lines() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS sales_records_sync_lines ON public.sales_records;
CREATE TRIGGER sales_records_sync_lines AFTER INSERT OR UPDATE ON public.sales_records
  FOR EACH ROW EXECUTE FUNCTION public.sync_sales_record_lines();