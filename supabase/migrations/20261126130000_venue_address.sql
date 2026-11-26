-- A venue's street address, shown in Settings › Venues and its Location tab. Operational, so the client edits it.
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS address text CHECK (address IS NULL OR length(address) <= 300);

CREATE OR REPLACE FUNCTION public.save_venue_address(t uuid, v uuid, p_address text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_platform_admin() OR (public.user_has_tenant(auth.uid(), t) AND public.has_role(auth.uid(), 'admin'))) THEN
    RAISE EXCEPTION 'Only an admin can change the address'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = v AND tenant_id = t) THEN RAISE EXCEPTION 'Unknown venue'; END IF;
  UPDATE public.venues SET address = nullif(btrim(coalesce(p_address, '')), '') WHERE id = v AND tenant_id = t;
END
$function$;
REVOKE ALL ON FUNCTION public.save_venue_address(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_venue_address(uuid, uuid, text) TO authenticated;
