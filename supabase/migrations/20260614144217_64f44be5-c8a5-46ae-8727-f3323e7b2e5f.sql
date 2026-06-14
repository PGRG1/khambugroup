CREATE OR REPLACE VIEW public.sales_data AS SELECT * FROM public.sales_records;
GRANT SELECT ON public.sales_data TO authenticated, service_role;