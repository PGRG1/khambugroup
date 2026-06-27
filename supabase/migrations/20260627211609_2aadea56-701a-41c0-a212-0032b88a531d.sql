
CREATE TABLE public.inventory_movements_waste (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  venue text NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  entry_type text NOT NULL CHECK (entry_type IN ('waste','consumption')),
  reason text NOT NULL,
  product_master_id uuid REFERENCES public.product_master(id) ON DELETE SET NULL,
  sku text,
  description text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  uom text,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_value numeric GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_imw_tenant_date ON public.inventory_movements_waste (tenant_id, entry_date DESC);
CREATE INDEX idx_imw_product ON public.inventory_movements_waste (product_master_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movements_waste TO authenticated;
GRANT ALL ON public.inventory_movements_waste TO service_role;

ALTER TABLE public.inventory_movements_waste ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imw select tenant"
  ON public.inventory_movements_waste FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "imw insert admin/manager"
  ON public.inventory_movements_waste FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

CREATE POLICY "imw update admin/manager"
  ON public.inventory_movements_waste FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

CREATE POLICY "imw delete admin/manager"
  ON public.inventory_movements_waste FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

CREATE TRIGGER trg_imw_updated_at
  BEFORE UPDATE ON public.inventory_movements_waste
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend inventory aggregates: subtract waste/consumption from on-hand qty and cost basis.
CREATE OR REPLACE FUNCTION public.get_inventory_aggregates(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(product_master_id uuid, total_qty numeric, total_spend numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH grn_agg AS (
    SELECT
      gi.product_master_id,
      SUM(COALESCE(gi.accepted_qty, gi.quantity_received)) AS qty,
      SUM(COALESCE(gi.accepted_qty, gi.quantity_received) * gi.unit_cost) AS spend
    FROM public.grn_items gi
    JOIN public.goods_received_notes g ON g.id = gi.grn_id
    JOIN public.product_master pm      ON pm.id = gi.product_master_id
    WHERE gi.product_master_id IS NOT NULL
      AND g.status IN ('confirmed','disputed')
      AND (p_tenant_id IS NULL OR gi.tenant_id = p_tenant_id)
      AND pm.creates_stock_movement = true
      AND COALESCE(pm.financial_treatment, '') NOT ILIKE 'Asset%'
    GROUP BY gi.product_master_id
  ),
  waste_agg AS (
    SELECT
      w.product_master_id,
      SUM(w.quantity) AS qty,
      SUM(w.quantity * w.unit_cost) AS spend
    FROM public.inventory_movements_waste w
    JOIN public.product_master pm ON pm.id = w.product_master_id
    WHERE w.product_master_id IS NOT NULL
      AND (p_tenant_id IS NULL OR w.tenant_id = p_tenant_id)
      AND pm.creates_stock_movement = true
      AND COALESCE(pm.financial_treatment, '') NOT ILIKE 'Asset%'
    GROUP BY w.product_master_id
  )
  SELECT
    pid AS product_master_id,
    COALESCE(SUM(qty), 0)::numeric AS total_qty,
    COALESCE(SUM(spend), 0)::numeric AS total_spend
  FROM (
    SELECT product_master_id AS pid, qty, spend FROM grn_agg
    UNION ALL
    SELECT product_master_id AS pid, -qty AS qty, -spend AS spend FROM waste_agg
  ) u
  GROUP BY pid;
$function$;

GRANT EXECUTE ON FUNCTION public.get_inventory_aggregates(uuid) TO authenticated, service_role;
