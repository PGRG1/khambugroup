
ALTER TABLE public.product_master
  ADD COLUMN IF NOT EXISTS creates_stock_movement boolean NOT NULL DEFAULT true;

UPDATE public.product_master SET creates_stock_movement = true
WHERE financial_treatment = 'COGS';

UPDATE public.product_master SET creates_stock_movement = false
WHERE financial_treatment IN ('OpEx', 'Asset - Supplier Deposit',
      'Asset - Fixed Asset', 'Asset - Prepayment', 'Asset - Other');

CREATE OR REPLACE FUNCTION public.get_inventory_aggregates(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(product_master_id uuid, total_qty numeric, total_spend numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    gi.product_master_id,
    COALESCE(SUM(COALESCE(gi.accepted_qty, gi.quantity_received)), 0)::numeric AS total_qty,
    COALESCE(SUM(COALESCE(gi.accepted_qty, gi.quantity_received) * gi.unit_cost), 0)::numeric AS total_spend
  FROM public.grn_items gi
  JOIN public.goods_received_notes g ON g.id = gi.grn_id
  JOIN public.product_master pm      ON pm.id = gi.product_master_id
  WHERE gi.product_master_id IS NOT NULL
    AND g.status IN ('confirmed','disputed')
    AND (p_tenant_id IS NULL OR gi.tenant_id = p_tenant_id)
    AND pm.creates_stock_movement = true
    AND COALESCE(pm.financial_treatment, '') NOT ILIKE 'Asset%'
  GROUP BY gi.product_master_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_inventory_aggregates(uuid) TO authenticated, service_role;
