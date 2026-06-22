CREATE SEQUENCE IF NOT EXISTS transfer_number_seq START 1;

CREATE TABLE public.transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number text NOT NULL UNIQUE DEFAULT
    'TRF-' || to_char(now(),'YYYYMMDD') || '-' ||
    lpad(nextval('transfer_number_seq')::text,4,'0'),
  from_venue text NOT NULL,
  to_venue text NOT NULL,
  from_location_id uuid REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  to_location_id uuid REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed','received','cancelled')),
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  received_by uuid REFERENCES auth.users(id),
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfers TO authenticated;
GRANT ALL ON public.transfers TO service_role;
GRANT USAGE ON SEQUENCE transfer_number_seq TO authenticated;

ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view transfers"
  ON public.transfers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and managers manage transfers"
  ON public.transfers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role));

CREATE TRIGGER update_transfers_updated_at
  BEFORE UPDATE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.transfers(id) ON DELETE CASCADE,
  product_master_id uuid NOT NULL REFERENCES public.product_master(id) ON DELETE RESTRICT,
  quantity_sent numeric NOT NULL DEFAULT 0,
  quantity_received numeric,
  unit text NOT NULL DEFAULT 'each',
  unit_cost numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transfer_id, product_master_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_items TO authenticated;
GRANT ALL ON public.transfer_items TO service_role;

ALTER TABLE public.transfer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view transfer_items"
  ON public.transfer_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and managers manage transfer_items"
  ON public.transfer_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role));

CREATE TRIGGER update_transfer_items_updated_at
  BEFORE UPDATE ON public.transfer_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_transfer_items_transfer_id ON public.transfer_items(transfer_id);
CREATE INDEX idx_transfers_status ON public.transfers(status);
CREATE INDEX idx_transfers_date ON public.transfers(transfer_date);