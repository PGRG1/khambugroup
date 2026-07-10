
-- 1) Data cleanup on procurement venue columns
UPDATE public.invoices SET venue = 'Assembly' WHERE venue = 'ASSEMBLY';
UPDATE public.invoices SET venue = 'Caliente' WHERE venue = 'Caliante';
UPDATE public.invoices SET venue = 'Caliente' WHERE venue IN ('Caliente and Hanabi','CALIENTE AND HANABI');

UPDATE public.goods_received_notes SET venue = 'Assembly' WHERE venue = 'ASSEMBLY';
UPDATE public.goods_received_notes SET venue = 'Caliente' WHERE venue = 'Caliante';
UPDATE public.goods_received_notes SET venue = 'Caliente' WHERE venue IN ('Caliente and Hanabi','CALIENTE AND HANABI');

-- 2) Validation function: venue name must exist in venues master for the tenant
CREATE OR REPLACE FUNCTION public.validate_venue_against_master()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_col text;
  v_value text;
BEGIN
  v_tenant_id := NEW.tenant_id;

  -- Which column(s) to validate depends on the table
  IF TG_TABLE_NAME = 'transfers' THEN
    IF NEW.from_venue IS NOT NULL AND btrim(NEW.from_venue) <> '' THEN
      IF NOT EXISTS (SELECT 1 FROM public.venues WHERE name = NEW.from_venue AND tenant_id = v_tenant_id) THEN
        RAISE EXCEPTION 'Invalid from_venue "%": must match a venue in the master list for this tenant', NEW.from_venue
          USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.to_venue IS NOT NULL AND btrim(NEW.to_venue) <> '' THEN
      IF NOT EXISTS (SELECT 1 FROM public.venues WHERE name = NEW.to_venue AND tenant_id = v_tenant_id) THEN
        RAISE EXCEPTION 'Invalid to_venue "%": must match a venue in the master list for this tenant', NEW.to_venue
          USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSE
    v_value := NEW.venue;
    IF v_value IS NOT NULL AND btrim(v_value) <> '' THEN
      IF NOT EXISTS (SELECT 1 FROM public.venues WHERE name = v_value AND tenant_id = v_tenant_id) THEN
        RAISE EXCEPTION 'Invalid venue "%": must match a venue in the master list for this tenant', v_value
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Attach triggers to each procurement table
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'invoices','purchase_orders','goods_received_notes','transfers',
    'stock_count_sessions','inventory_movements_waste','inventory_counts',
    'credit_notes','deposit_opening_balances','supplier_opening_balances'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_validate_venue ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_validate_venue BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.validate_venue_against_master()',
      t, t
    );
  END LOOP;
END $$;
