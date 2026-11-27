DROP POLICY IF EXISTS "unit master readable" ON public.unit_master;
CREATE POLICY "unit master readable" ON public.unit_master FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));