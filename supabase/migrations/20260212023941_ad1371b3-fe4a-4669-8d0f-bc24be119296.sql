
-- Tighten sales_records RLS to authenticated users only
DROP POLICY "Allow public read" ON public.sales_records;
DROP POLICY "Allow public insert" ON public.sales_records;
DROP POLICY "Allow public update" ON public.sales_records;
DROP POLICY "Allow public delete" ON public.sales_records;

CREATE POLICY "Authenticated users can read sales"
  ON public.sales_records FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert sales"
  ON public.sales_records FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update sales"
  ON public.sales_records FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Admins can delete sales"
  ON public.sales_records FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
