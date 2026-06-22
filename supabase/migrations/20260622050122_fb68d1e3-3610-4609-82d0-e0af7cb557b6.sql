
CREATE TABLE public.stock_count_location_qtys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_item_id uuid NOT NULL REFERENCES public.stock_count_items(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.stock_locations(id) ON DELETE CASCADE,
  qty numeric,
  counted_by uuid REFERENCES auth.users(id),
  counted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (count_item_id, location_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_count_location_qtys TO authenticated;
GRANT ALL ON public.stock_count_location_qtys TO service_role;

ALTER TABLE public.stock_count_location_qtys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view stock_count_location_qtys"
  ON public.stock_count_location_qtys
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin/manager can write stock_count_location_qtys"
  ON public.stock_count_location_qtys
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE TRIGGER update_stock_count_location_qtys_updated_at
  BEFORE UPDATE ON public.stock_count_location_qtys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_stock_count_location_qtys_item ON public.stock_count_location_qtys(count_item_id);
CREATE INDEX idx_stock_count_location_qtys_location ON public.stock_count_location_qtys(location_id);
