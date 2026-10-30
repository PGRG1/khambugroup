CREATE TABLE public.sales_receipt_intakes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), venue_id uuid REFERENCES public.venues(id), uploaded_by uuid NOT NULL, scan_id uuid REFERENCES public.sales_scan_extractions(id), source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'), source_path text NOT NULL, source_name text NOT NULL, original_values jsonb NOT NULL, tentative_values jsonb NOT NULL, reasons jsonb NOT NULL, existing_record_ids uuid[] NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'needs_review' CHECK(status IN ('needs_review','resolved')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,source_sha256)
);
GRANT SELECT ON public.sales_receipt_intakes TO authenticated;
GRANT ALL ON public.sales_receipt_intakes TO service_role;
ALTER TABLE public.sales_receipt_intakes ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_intake_scoped_read ON public.sales_receipt_intakes FOR SELECT TO authenticated USING ((public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(),tenant_id)) AND (venue_id IS NULL OR public.user_has_venue(auth.uid(),venue_id)));
CREATE POLICY sales_intake_source_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='sales-receipt-intake' AND EXISTS (SELECT 1 FROM public.sales_receipt_intakes i WHERE i.source_path=name));
CREATE FUNCTION public.register_sales_receipt_intake(p_tenant uuid,p_venue uuid,p_user uuid,p_scan uuid,p_hash text,p_path text,p_name text,p_original jsonb,p_tentative jsonb,p_reasons jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved_id uuid; links uuid[]; prior uuid;
BEGIN
 IF NOT (public.is_super_admin(p_user) OR public.user_has_tenant(p_user,p_tenant)) OR NOT (public.has_role(p_user,'admin') OR public.has_role(p_user,'manager')) THEN RAISE EXCEPTION 'Receipt scope denied'; END IF;
 IF p_venue IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM public.venues WHERE id=p_venue AND tenant_id=p_tenant) OR NOT public.user_has_venue(p_user,p_venue)) THEN RAISE EXCEPTION 'Venue scope denied'; END IF;
 IF p_scan IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sales_scan_extractions WHERE id=p_scan AND tenant_id=p_tenant AND scanned_by=p_user AND source_sha256=p_hash) THEN RAISE EXCEPTION 'Extraction source mismatch'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text || p_hash,0));
 SELECT id INTO prior FROM public.sales_receipt_intakes WHERE tenant_id=p_tenant AND source_sha256=p_hash;
 IF prior IS NOT NULL THEN RETURN jsonb_build_object('status','flagged','intakeId',prior,'repeated',true); END IF;
 SELECT coalesce(array_agg(id),'{}') INTO links FROM public.sales_records WHERE tenant_id=p_tenant AND venue_id=p_venue AND (date=p_tentative->>'date' OR (nullif(trim(p_tentative->>'reportNumber'),'') IS NOT NULL AND report_number=p_tentative->>'reportNumber'));
 INSERT INTO public.sales_receipt_intakes(tenant_id,venue_id,uploaded_by,scan_id,source_sha256,source_path,source_name,original_values,tentative_values,reasons,existing_record_ids) VALUES(p_tenant,p_venue,p_user,p_scan,p_hash,p_path,p_name,p_original,p_tentative,p_reasons || CASE WHEN cardinality(links)>0 THEN '["Existing date or report: compare sessions/corrections before posting"]'::jsonb ELSE '[]'::jsonb END,links) RETURNING id INTO saved_id;
 RETURN jsonb_build_object('status','flagged','intakeId',saved_id,'repeated',false);
END $$;
REVOKE ALL ON FUNCTION public.register_sales_receipt_intake(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_sales_receipt_intake(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,jsonb) TO service_role;
CREATE FUNCTION public.guard_sales_tenant_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION 'Sales tenant cannot be reassigned'; END IF; RETURN NEW; END $$;
CREATE TRIGGER sales_records_immutable_tenant BEFORE UPDATE ON public.sales_records FOR EACH ROW EXECUTE FUNCTION public.guard_sales_tenant_change();
COMMENT ON TABLE public.sales_receipt_intakes IS 'Non-posting receipt evidence. No journal or sales insert is performed; source confidence and arithmetic alone cannot authorise posting.';