
-- 1. Allow 'disputed' on GRNs
ALTER TABLE public.goods_received_notes DROP CONSTRAINT IF EXISTS goods_received_notes_status_check;
ALTER TABLE public.goods_received_notes ADD CONSTRAINT goods_received_notes_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'confirmed'::text, 'disputed'::text]));

-- 2. Inventory aggregate from GRNs
CREATE OR REPLACE FUNCTION public.get_inventory_aggregates(p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (
  product_master_id uuid,
  total_qty numeric,
  total_spend numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    gi.product_master_id,
    COALESCE(SUM(COALESCE(gi.accepted_qty, gi.quantity_received)), 0)::numeric AS total_qty,
    COALESCE(SUM(COALESCE(gi.accepted_qty, gi.quantity_received) * gi.unit_cost), 0)::numeric AS total_spend
  FROM public.grn_items gi
  JOIN public.goods_received_notes g ON g.id = gi.grn_id
  WHERE gi.product_master_id IS NOT NULL
    AND g.status IN ('confirmed','disputed')
    AND (p_tenant_id IS NULL OR gi.tenant_id = p_tenant_id)
  GROUP BY gi.product_master_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_inventory_aggregates(uuid) TO authenticated, service_role;
