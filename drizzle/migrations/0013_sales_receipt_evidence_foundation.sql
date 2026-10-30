CREATE TABLE public.sales_scan_extractions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, scanned_by uuid NOT NULL,
 original_values jsonb NOT NULL, source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
 source_mime_type text NOT NULL, extractor_model text NOT NULL, extractor_version text NOT NULL,
 report_structure text NULL, extracted_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sales_scan_extractions TO service_role;
ALTER TABLE public.sales_scan_extractions ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.sales_scan_examples (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, venue_id uuid NOT NULL,
 scan_id uuid NOT NULL REFERENCES public.sales_scan_extractions(id), sales_record_id uuid NOT NULL,
 original_values jsonb NOT NULL, saved_values jsonb NOT NULL, field_differences jsonb NOT NULL,
 receipt_bucket text NOT NULL DEFAULT 'sales-receipts', receipt_path text NULL, receipt_file_name text NULL,
 source_link_state text NOT NULL CHECK (source_link_state IN ('missing_reference','hash_mismatch','upload_unavailable','hash_matched')),
 saved_by uuid NOT NULL, sales_created_at timestamptz NOT NULL, captured_at timestamptz NOT NULL DEFAULT now(),
 value_provenance text NOT NULL DEFAULT 'human_saved_unverified' CHECK (value_provenance = 'human_saved_unverified'),
 UNIQUE (scan_id, sales_record_id)
);
GRANT SELECT ON public.sales_scan_examples TO authenticated;
GRANT ALL ON public.sales_scan_examples TO service_role;
ALTER TABLE public.sales_scan_examples ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_scan_examples_scoped_read ON public.sales_scan_examples FOR SELECT TO authenticated
 USING (public.user_has_tenant(auth.uid(),tenant_id) AND public.user_has_venue(auth.uid(),venue_id));
CREATE INDEX sales_scan_examples_scope ON public.sales_scan_examples(tenant_id,venue_id,captured_at DESC);
CREATE TABLE public.sales_scan_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), example_id uuid NOT NULL REFERENCES public.sales_scan_examples(id),
 tenant_id uuid NOT NULL, verified_by uuid NOT NULL, verified_at timestamptz NOT NULL DEFAULT now(),
 verification_method text NOT NULL CHECK (verification_method IN ('independent_document_review','independent_source_reconciliation')),
 source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'), verified_values jsonb NOT NULL,
 field_evidence jsonb NOT NULL CHECK (jsonb_typeof(field_evidence) = 'object' AND field_evidence <> '{}'::jsonb),
 verification_reference text NOT NULL CHECK (length(trim(verification_reference)) > 0)
);
GRANT ALL ON public.sales_scan_verifications TO service_role;
ALTER TABLE public.sales_scan_verifications ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.sales_scan_evidence_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'Sales scan evidence is append-only'; END; $$;
CREATE TRIGGER sales_scan_extractions_immutable BEFORE UPDATE OR DELETE ON public.sales_scan_extractions FOR EACH ROW EXECUTE FUNCTION public.sales_scan_evidence_immutable();
CREATE TRIGGER sales_scan_examples_immutable BEFORE UPDATE OR DELETE ON public.sales_scan_examples FOR EACH ROW EXECUTE FUNCTION public.sales_scan_evidence_immutable();
CREATE TRIGGER sales_scan_verifications_immutable BEFORE UPDATE OR DELETE ON public.sales_scan_verifications FOR EACH ROW EXECUTE FUNCTION public.sales_scan_evidence_immutable();
CREATE FUNCTION public.capture_sales_scan_example(p_scan_id uuid,p_sales_record_id uuid,p_tenant_id uuid,p_user_id uuid,p_source_link_state text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.sales_records; x public.sales_scan_extractions; saved jsonb; diffs jsonb; result uuid;
BEGIN
 SELECT * INTO s FROM public.sales_records WHERE id=p_sales_record_id AND tenant_id=p_tenant_id FOR SHARE;
 SELECT * INTO x FROM public.sales_scan_extractions WHERE id=p_scan_id AND tenant_id=p_tenant_id AND scanned_by=p_user_id;
 IF s.id IS NULL OR x.id IS NULL OR s.venue_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.venues WHERE id=s.venue_id AND tenant_id=p_tenant_id)
 OR NOT public.user_has_tenant(p_user_id,p_tenant_id) OR NOT public.user_has_venue(p_user_id,s.venue_id)
 OR NOT (public.has_role(p_user_id,'admin') OR public.has_role(p_user_id,'manager')) THEN
 RAISE EXCEPTION 'Receipt evidence scope denied' USING ERRCODE='42501'; END IF;
 saved := jsonb_build_object('date',s.date,'venue',s.venue,'reportNumber',s.report_number,'orders',s.orders,'guests',s.guests,
 'subtotal',s.subtotal,'serviceCharge',s.service_charge,'discount',s.discount,'totalSales',s.total_sales,
 'visa',s.visa,'mastercard',s.mastercard,'amex',s.amex,'unionPay',s.union_pay,'jcb',s.jcb,'alipay',s.alipay,
 'wechat',s.wechat,'payme',s.payme,'cash',s.cash,'deliveroo',s.deliveroo,'foodpanda',s.foodpanda,'keeta',s.keeta,'cardTips',s.card_tips);
 SELECT coalesce(jsonb_object_agg(k,jsonb_build_object('original',x.original_values->k,'saved',saved->k,'provenance','human_saved_unverified')),'{}'::jsonb)
 INTO diffs FROM jsonb_object_keys(saved) k WHERE (x.original_values->k) IS DISTINCT FROM (saved->k);
 INSERT INTO public.sales_scan_examples(tenant_id,venue_id,scan_id,sales_record_id,original_values,saved_values,field_differences,
 receipt_path,receipt_file_name,source_link_state,saved_by,sales_created_at)
 VALUES(p_tenant_id,s.venue_id,x.id,s.id,x.original_values,saved,diffs,s.receipt_file_url,s.receipt_file_name,
 CASE WHEN s.receipt_file_url IS NULL THEN 'missing_reference' ELSE p_source_link_state END,p_user_id,s.created_at)
 ON CONFLICT (scan_id,sales_record_id) DO NOTHING RETURNING id INTO result;
 IF result IS NULL THEN SELECT id INTO result FROM public.sales_scan_examples WHERE scan_id=p_scan_id AND sales_record_id=p_sales_record_id; END IF;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.capture_sales_scan_example(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.capture_sales_scan_example(uuid,uuid,uuid,uuid,text) TO service_role;
COMMENT ON TABLE public.sales_scan_examples IS 'Immutable human-save audit snapshots; NOT verified interpretation guidance. No existing sales records are backfilled or changed.';
COMMENT ON TABLE public.sales_scan_verifications IS 'Independent source attestations only. Step 1 exposes no verification writer or automatic promotion.';