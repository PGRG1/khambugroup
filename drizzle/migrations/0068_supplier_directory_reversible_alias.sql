ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS directory_merged_into uuid REFERENCES public.suppliers(id);
COMMENT ON COLUMN public.suppliers.directory_merged_into IS 'Reversible directory alias only; invoices, journals, payments and original supplier IDs remain unchanged.';
CREATE OR REPLACE FUNCTION public.set_supplier_directory_alias(p_tenant uuid,p_from uuid,p_into uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ BEGIN
IF NOT public.user_has_tenant(auth.uid(),p_tenant) OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin required'; END IF;
PERFORM id FROM public.suppliers WHERE tenant_id=p_tenant AND (id=p_from OR id=p_into) ORDER BY id FOR UPDATE;
IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=p_from AND tenant_id=p_tenant) THEN RAISE EXCEPTION 'Supplier unavailable'; END IF;
IF p_into IS NOT NULL AND (p_from=p_into OR NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=p_into AND tenant_id=p_tenant AND directory_merged_into IS NULL) OR EXISTS(SELECT 1 FROM public.suppliers WHERE tenant_id=p_tenant AND directory_merged_into=p_from)) THEN RAISE EXCEPTION 'Cannot merge nested aliases'; END IF;
UPDATE public.suppliers SET directory_merged_into=p_into WHERE id=p_from AND tenant_id=p_tenant;
INSERT INTO public.audit_log(tenant_id,user_id,action,entity_type,entity_id,details) VALUES(p_tenant,auth.uid(),CASE WHEN p_into IS NULL THEN 'undo_supplier_directory_merge' ELSE 'supplier_directory_merge' END,'suppliers',p_from::text,jsonb_build_object('into',p_into,'financial_records_unchanged',true)); END $$;
REVOKE ALL ON FUNCTION public.set_supplier_directory_alias(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_supplier_directory_alias(uuid,uuid,uuid) TO authenticated;