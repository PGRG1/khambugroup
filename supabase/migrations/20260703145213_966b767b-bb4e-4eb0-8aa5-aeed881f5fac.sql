
-- Retarget sales_records.service_period_id to venue_service_periods (the table the app writes to)
ALTER TABLE public.sales_records
  DROP CONSTRAINT IF EXISTS sales_records_service_period_id_fkey;

ALTER TABLE public.sales_records
  ADD CONSTRAINT sales_records_service_period_id_fkey
  FOREIGN KEY (service_period_id)
  REFERENCES public.venue_service_periods(id)
  ON DELETE SET NULL;

-- Backfill: tag ALL historical sales_records with each venue's "Late Operation" period
UPDATE public.sales_records sr
SET service_period_id = vsp.id
FROM public.venue_service_periods vsp
WHERE vsp.venue_id = sr.venue_id
  AND vsp.name ILIKE 'Late Operation%'
  AND vsp.is_active = true;
