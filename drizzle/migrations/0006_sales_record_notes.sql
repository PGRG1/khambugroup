CREATE TABLE public.sales_record_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sales_record_id uuid NOT NULL REFERENCES public.sales_records(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid(),
  author_name text,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  tag text NULL CHECK (tag IS NULL OR tag IN ('Closed early','Private event','Weather','POS problem','Staff short','Other')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sales_record_notes_record_idx ON public.sales_record_notes(sales_record_id);
CREATE INDEX sales_record_notes_tenant_idx ON public.sales_record_notes(tenant_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_record_notes TO authenticated;
GRANT ALL ON public.sales_record_notes TO service_role;
ALTER TABLE public.sales_record_notes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sales_record_notes_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.author_id := COALESCE(auth.uid(), NEW.author_id);
    NEW.created_at := now();
  ELSE
    NEW.author_id := OLD.author_id;
    NEW.created_at := OLD.created_at;
    NEW.tenant_id := OLD.tenant_id;
    NEW.sales_record_id := OLD.sales_record_id;
  END IF;
  SELECT tenant_id INTO NEW.tenant_id FROM public.sales_records WHERE id = NEW.sales_record_id;
  SELECT display_name INTO NEW.author_name FROM public.profiles WHERE user_id = NEW.author_id LIMIT 1;
  RETURN NEW;
END $$;
CREATE TRIGGER sales_record_notes_fill BEFORE INSERT OR UPDATE ON public.sales_record_notes
FOR EACH ROW EXECUTE FUNCTION public.sales_record_notes_fill();

CREATE POLICY "Read notes on visible sales records" ON public.sales_record_notes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.sales_records s WHERE s.id = sales_record_id));

CREATE POLICY "Members who see the venue can add notes" ON public.sales_record_notes FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.sales_records s
    WHERE s.id = sales_record_id AND s.tenant_id = sales_record_notes.tenant_id
      AND (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), s.tenant_id))
      AND (s.venue_id IS NULL OR public.user_has_venue(auth.uid(), s.venue_id))
  )
);

CREATE POLICY "Authors edit own notes within 24h" ON public.sales_record_notes FOR UPDATE TO authenticated
USING (author_id = auth.uid() AND created_at > now() - interval '24 hours')
WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors delete own within 24h, admins any" ON public.sales_record_notes FOR DELETE TO authenticated
USING (
  (author_id = auth.uid() AND created_at > now() - interval '24 hours')
  OR public.is_super_admin(auth.uid())
  OR public.is_tenant_admin(tenant_id, auth.uid())
  OR (public.has_role(auth.uid(), 'admin') AND public.user_has_tenant(auth.uid(), tenant_id))
);