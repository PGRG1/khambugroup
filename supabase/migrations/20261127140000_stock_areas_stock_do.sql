-- Stock areas live in Stock & menu: anyone with Do on Stock may add, rename or archive them (admins and managers as before).
DROP POLICY IF EXISTS "stock_locations write" ON public.stock_locations;
CREATE POLICY "stock_locations write" ON public.stock_locations FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.access_level(tenant_id, 'stock') >= 2)))
WITH CHECK (public.is_platform_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.access_level(tenant_id, 'stock') >= 2)));
