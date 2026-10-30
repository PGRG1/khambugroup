REVOKE ALL ON public.sales_scan_extractions FROM anon, authenticated;
REVOKE ALL ON public.sales_scan_examples FROM anon, authenticated;
REVOKE ALL ON public.sales_scan_verifications FROM anon, authenticated;
GRANT SELECT ON public.sales_scan_examples TO authenticated;
GRANT ALL ON public.sales_scan_extractions, public.sales_scan_examples, public.sales_scan_verifications TO service_role;
REVOKE ALL ON FUNCTION public.sales_scan_evidence_immutable() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.capture_sales_scan_example(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.capture_sales_scan_example(uuid,uuid,uuid,uuid,text) TO service_role;