
REVOKE EXECUTE ON FUNCTION public.platform_upsert_organization(uuid,uuid,text,text,text,date,text,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.platform_delete_organization(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.platform_upsert_venue(uuid,uuid,text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.platform_update_tenant_localisation(uuid,text,text,text,date,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.platform_upsert_account_opening_balances(uuid,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.platform_load_coa_template(uuid,uuid) FROM PUBLIC, anon;
