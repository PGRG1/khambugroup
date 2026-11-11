DROP POLICY IF EXISTS "coa templates readable" ON public.coa_templates;
CREATE POLICY "coa templates readable" ON public.coa_templates FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can read venues" ON public.venues;
CREATE POLICY "Authenticated can read venues" ON public.venues FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(), tenant_id));
DROP POLICY IF EXISTS "Authenticated can read organizations" ON public.organizations;
CREATE POLICY "Authenticated can read organizations" ON public.organizations FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(), tenant_id));
DROP POLICY IF EXISTS "GRNs viewable by authenticated" ON public.goods_received_notes;
CREATE POLICY "GRNs viewable by authenticated" ON public.goods_received_notes FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(), tenant_id));
DROP POLICY IF EXISTS "GRN items viewable by authenticated" ON public.grn_items;
CREATE POLICY "GRN items viewable by authenticated" ON public.grn_items FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(), tenant_id));
DROP POLICY IF EXISTS "stock_locations select" ON public.stock_locations;
CREATE POLICY "stock_locations select" ON public.stock_locations FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(), tenant_id));
DROP POLICY IF EXISTS "seq_read_same_tenant" ON public.hr_employee_code_seq;
CREATE POLICY "seq_read_same_tenant" ON public.hr_employee_code_seq FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(), tenant_id));

CREATE OR REPLACE FUNCTION public.profile_visible(_profile_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _profile_user = auth.uid()
    OR public.is_platform_admin(auth.uid()) OR public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM tenant_members a JOIN tenant_members b ON a.tenant_id = b.tenant_id
               WHERE a.user_id = auth.uid() AND b.user_id = _profile_user);
$$;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.profile_visible(user_id));

CREATE OR REPLACE FUNCTION public.storage_object_readable(_bucket text, _name text, _owner text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, storage AS $$
  SELECT auth.uid() IS NOT NULL AND (
    _owner = auth.uid()::text
    OR public.is_platform_admin(auth.uid()) OR public.is_super_admin(auth.uid())
    OR (storage.foldername(_name))[1] = auth.uid()::text
    OR EXISTS (SELECT 1 FROM tenant_members m WHERE m.user_id = auth.uid() AND m.tenant_id::text = (storage.foldername(_name))[1])
    OR (_bucket = 'sales-receipts' AND EXISTS (SELECT 1 FROM sales_records r WHERE public.user_has_tenant(auth.uid(), r.tenant_id) AND (r.receipt_file_url = _name OR r.receipt_file_url LIKE '%' || _name || '%')))
    OR (_bucket IN ('petty-cash-receipts','receipts') AND (
         EXISTS (SELECT 1 FROM petty_cash_receipts r WHERE public.user_has_tenant(auth.uid(), r.tenant_id) AND (r.receipt_path = _name OR r.receipt_url LIKE '%' || _name || '%'))
      OR EXISTS (SELECT 1 FROM staff_reimbursements r WHERE public.user_has_tenant(auth.uid(), r.tenant_id) AND (r.receipt_path = _name OR r.receipt_url LIKE '%' || _name || '%'))))
    OR (_bucket = 'bill-attachments' AND EXISTS (SELECT 1 FROM expense_bills b WHERE public.user_has_tenant(auth.uid(), b.tenant_id) AND (b.attachment_path = _name OR b.attachment_url LIKE '%' || _name || '%')))
    OR (_bucket = 'payment-statements' AND EXISTS (SELECT 1 FROM payment_settlement_imports i WHERE public.user_has_tenant(auth.uid(), i.tenant_id) AND i.file_url = _name))
    OR (_bucket = 'bank-attachments' AND EXISTS (SELECT 1 FROM bank_transactions t WHERE public.user_has_tenant(auth.uid(), t.tenant_id) AND EXISTS (SELECT 1 FROM unnest(t.attachment_urls) u WHERE u = _name OR u LIKE '%' || _name || '%')))
  );
$$;

DROP POLICY IF EXISTS "Authenticated users can view receipts" ON storage.objects;
CREATE POLICY "Authenticated users can view receipts" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'receipts' AND public.storage_object_readable(bucket_id, name, owner_id));
DROP POLICY IF EXISTS "Authenticated can read sales receipts" ON storage.objects;
CREATE POLICY "Authenticated can read sales receipts" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'sales-receipts' AND public.storage_object_readable(bucket_id, name, owner_id));
DROP POLICY IF EXISTS "auth read bank attachments" ON storage.objects;
CREATE POLICY "auth read bank attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'bank-attachments' AND public.storage_object_readable(bucket_id, name, owner_id));
DROP POLICY IF EXISTS "petty_cash_receipts_read" ON storage.objects;
CREATE POLICY "petty_cash_receipts_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'petty-cash-receipts' AND public.storage_object_readable(bucket_id, name, owner_id));
DROP POLICY IF EXISTS "Authenticated read bill-attachments" ON storage.objects;
CREATE POLICY "Authenticated read bill-attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'bill-attachments' AND public.storage_object_readable(bucket_id, name, owner_id));
DROP POLICY IF EXISTS "Authenticated can read payment statements" ON storage.objects;
CREATE POLICY "Authenticated can read payment statements" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'payment-statements' AND public.storage_object_readable(bucket_id, name, owner_id));
DROP POLICY IF EXISTS "sales_intake_source_read" ON storage.objects;
CREATE POLICY "sales_intake_source_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'sales-receipt-intake' AND EXISTS (SELECT 1 FROM public.sales_receipt_intakes i WHERE i.source_path = objects.name AND public.user_has_tenant(auth.uid(), i.tenant_id)));