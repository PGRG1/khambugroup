
-- Restrict insert to admins only
DROP POLICY IF EXISTS "Authenticated users can insert sales" ON public.sales_records;
CREATE POLICY "Admins can insert sales"
ON public.sales_records
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Restrict update to admins only
DROP POLICY IF EXISTS "Authenticated users can update sales" ON public.sales_records;
CREATE POLICY "Admins can update sales"
ON public.sales_records
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
