CREATE TABLE public.venue_seat_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  seats integer NOT NULL CHECK (seats > 0),
  effective_from date NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, effective_from)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_seat_history TO authenticated;
GRANT ALL ON public.venue_seat_history TO service_role;
ALTER TABLE public.venue_seat_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read seat history" ON public.venue_seat_history FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "Authorized can manage seat history" ON public.venue_seat_history FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.is_platform_admin(auth.uid())) AND (public.is_tenant_member(tenant_id, auth.uid()) OR public.is_platform_admin(auth.uid())))
  WITH CHECK ((public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.is_platform_admin(auth.uid())) AND (public.is_tenant_member(tenant_id, auth.uid()) OR public.is_platform_admin(auth.uid())));
CREATE INDEX venue_seat_history_venue_idx ON public.venue_seat_history (venue_id, effective_from);

-- Keep venues.seats equal to the latest effective count.
CREATE OR REPLACE FUNCTION public.sync_venue_latest_seats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v := OLD.venue_id; ELSE v := NEW.venue_id; END IF;
  UPDATE public.venues SET seats = (
    SELECT seats FROM public.venue_seat_history h WHERE h.venue_id = v
    ORDER BY effective_from DESC, created_at DESC LIMIT 1)
  WHERE id = v;
  RETURN NULL;
END $$;
CREATE TRIGGER venue_seat_history_sync AFTER INSERT OR UPDATE OR DELETE ON public.venue_seat_history
  FOR EACH ROW EXECUTE FUNCTION public.sync_venue_latest_seats();

INSERT INTO public.venue_seat_history (tenant_id, venue_id, seats, effective_from)
SELECT v.tenant_id, v.id, v.seats,
  COALESCE((SELECT min(s.date::date) FROM public.sales_records s WHERE s.venue_id = v.id), v.created_at::date)
FROM public.venues v
WHERE v.seats IS NOT NULL AND v.seats > 0 AND v.tenant_id IS NOT NULL;