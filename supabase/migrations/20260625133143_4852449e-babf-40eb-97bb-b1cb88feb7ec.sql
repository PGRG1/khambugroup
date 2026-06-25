REVOKE EXECUTE ON FUNCTION public.sync_grn_from_invoice(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_grn_from_invoice(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_grn_from_invoice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_grn_from_invoice(uuid, uuid) TO service_role;