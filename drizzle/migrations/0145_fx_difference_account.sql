CREATE OR REPLACE FUNCTION public.fx_difference_account(t uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s text:=nullif(current_setting('finance.fx_difference_account',true),''); BEGIN
 IF s IS NOT NULL AND EXISTS(SELECT 1 FROM chart_of_accounts WHERE tenant_id=t AND id=s::uuid) THEN RETURN s::uuid; END IF; RETURN fx_realised_account(t); END $$;
REVOKE ALL ON FUNCTION public.fx_difference_account(uuid) FROM anon;