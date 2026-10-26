CREATE OR REPLACE FUNCTION public.seed_venue_seat_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.seats IS NOT NULL AND NEW.seats > 0 AND NEW.tenant_id IS NOT NULL THEN
    INSERT INTO public.venue_seat_history (tenant_id, venue_id, seats, effective_from, created_by)
    VALUES (NEW.tenant_id, NEW.id, NEW.seats, COALESCE(NEW.created_at::date, current_date), auth.uid())
    ON CONFLICT (venue_id, effective_from) DO NOTHING;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER venues_seed_seat_history AFTER INSERT ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.seed_venue_seat_history();