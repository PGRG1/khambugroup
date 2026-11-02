CREATE OR REPLACE FUNCTION public.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()) $$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;