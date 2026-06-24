DO $$
DECLARE
  t uuid := '00000000-0000-0000-0000-00000000beef';
BEGIN
  -- product_master
  UPDATE public.product_master
     SET base_unit_type = ''
   WHERE tenant_id = t
     AND base_unit_type IS NOT NULL
     AND base_unit_type <> ''
     AND base_unit_type NOT IN (SELECT code FROM public.uom_options WHERE tenant_id = t AND uom_type = 'base' AND is_active);

  UPDATE public.product_master
     SET stock_uom = ''
   WHERE tenant_id = t
     AND stock_uom IS NOT NULL
     AND stock_uom <> ''
     AND stock_uom NOT IN (SELECT code FROM public.uom_options WHERE tenant_id = t AND uom_type = 'stock' AND is_active);

  UPDATE public.product_master
     SET purchase_unit = ''
   WHERE tenant_id = t
     AND purchase_unit IS NOT NULL
     AND purchase_unit <> ''
     AND purchase_unit NOT IN (SELECT code FROM public.uom_options WHERE tenant_id = t AND uom_type = 'purchase' AND is_active);

  -- product_suppliers
  UPDATE public.product_suppliers
     SET base_unit_type = ''
   WHERE tenant_id = t
     AND base_unit_type IS NOT NULL
     AND base_unit_type <> ''
     AND base_unit_type NOT IN (SELECT code FROM public.uom_options WHERE tenant_id = t AND uom_type = 'base' AND is_active);

  UPDATE public.product_suppliers
     SET stock_uom = ''
   WHERE tenant_id = t
     AND stock_uom IS NOT NULL
     AND stock_uom <> ''
     AND stock_uom NOT IN (SELECT code FROM public.uom_options WHERE tenant_id = t AND uom_type = 'stock' AND is_active);

  UPDATE public.product_suppliers
     SET purchase_unit = ''
   WHERE tenant_id = t
     AND purchase_unit IS NOT NULL
     AND purchase_unit <> ''
     AND purchase_unit NOT IN (SELECT code FROM public.uom_options WHERE tenant_id = t AND uom_type = 'purchase' AND is_active);
END $$;