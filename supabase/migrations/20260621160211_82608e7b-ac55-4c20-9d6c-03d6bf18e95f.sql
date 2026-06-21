
CREATE SEQUENCE IF NOT EXISTS grn_number_seq START 1;

CREATE TABLE public.goods_received_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number text NOT NULL UNIQUE DEFAULT
    'GRN-' || to_char(now(), 'YYYYMMDD') || '-' ||
    lpad(nextval('grn_number_seq')::text, 4, '0'),
  po_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  venue text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  received_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.grn_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id uuid NOT NULL REFERENCES public.goods_received_notes(id) ON DELETE CASCADE,
  po_item_id uuid REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  invoice_line_item_id uuid REFERENCES public.invoice_line_items(id) ON DELETE SET NULL,
  product_master_id uuid REFERENCES public.product_master(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity_invoiced numeric,
  quantity_ordered numeric,
  quantity_received numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'each',
  unit_cost numeric NOT NULL DEFAULT 0,
  total numeric GENERATED ALWAYS AS (quantity_received * unit_cost) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_received_notes TO authenticated;
GRANT ALL ON public.goods_received_notes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grn_items TO authenticated;
GRANT ALL ON public.grn_items TO service_role;

ALTER TABLE public.goods_received_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grn_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "GRNs viewable by authenticated" ON public.goods_received_notes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "GRNs writable by admin/manager" ON public.goods_received_notes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "GRN items viewable by authenticated" ON public.grn_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "GRN items writable by admin/manager" ON public.grn_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_goods_received_notes_updated_at
  BEFORE UPDATE ON public.goods_received_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.update_po_status_on_grn_confirm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po_id uuid;
  v_all_received boolean;
  v_any_received boolean;
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') AND NEW.po_id IS NOT NULL THEN
    v_po_id := NEW.po_id;

    SELECT
      bool_and(COALESCE(recv.qty_recv, 0) >= poi.quantity_ordered),
      bool_or(COALESCE(recv.qty_recv, 0) > 0)
    INTO v_all_received, v_any_received
    FROM public.purchase_order_items poi
    LEFT JOIN (
      SELECT po_item_id, SUM(quantity_received) AS qty_recv
      FROM public.grn_items gi
      JOIN public.goods_received_notes g ON g.id = gi.grn_id
      WHERE g.status = 'confirmed'
        AND (g.id = NEW.id OR g.po_id = v_po_id)
      GROUP BY po_item_id
    ) recv ON recv.po_item_id = poi.id
    WHERE poi.po_id = v_po_id;

    IF v_all_received THEN
      UPDATE public.purchase_orders SET status = 'received' WHERE id = v_po_id;
    ELSIF v_any_received THEN
      UPDATE public.purchase_orders SET status = 'partial' WHERE id = v_po_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_po_status_on_grn_confirm
  BEFORE UPDATE ON public.goods_received_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_po_status_on_grn_confirm();
