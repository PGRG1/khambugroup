CREATE OR REPLACE FUNCTION public.resolve_sales_receipt_intake(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM sales_receipt_intakes WHERE id = _id FOR UPDATE;
  IF r IS NULL THEN RAISE EXCEPTION 'Receipt not found'; END IF;
  IF NOT (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), r.tenant_id)) OR (r.venue_id IS NOT NULL AND NOT user_has_venue(auth.uid(), r.venue_id)) THEN
    RAISE EXCEPTION 'Not allowed'; END IF;
  IF r.status <> 'needs_review' THEN RETURN; END IF;
  UPDATE sales_receipt_intakes SET status = 'resolved',
    verification = coalesce(verification,'{}'::jsonb) || jsonb_build_object('resolved_by', auth.uid(), 'resolved_at', now(), 'resolution', left(coalesce(_reason,''),200))
  WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.resolve_sales_receipt_intake(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resolve_sales_receipt_intake(uuid,text) TO authenticated;