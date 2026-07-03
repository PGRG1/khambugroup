
CREATE OR REPLACE FUNCTION public.add_revenue_event_with_replacement(
  p_tenant_id uuid,
  p_venue_id uuid,
  p_target_date date,
  p_event_name text,
  p_event_mode text,
  p_replaces_service_period_id uuid,
  p_target_input_mode text,
  p_manager_guest_target numeric,
  p_manager_spend_per_guest_target numeric,
  p_manager_revenue_override numeric,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_venue_id IS NULL OR p_target_date IS NULL THEN
    RAISE EXCEPTION 'tenant, venue and date are required';
  END IF;
  IF p_event_name IS NULL OR btrim(p_event_name) = '' THEN
    RAISE EXCEPTION 'event name required';
  END IF;

  -- Insert the event line
  INSERT INTO public.revenue_manager_target_lines (
    tenant_id, venue_id, target_date, line_type,
    event_name, event_mode, replaces_service_period_id,
    target_input_mode, manager_guest_target, manager_spend_per_guest_target,
    manager_revenue_override, line_status, status, manager_source, notes
  ) VALUES (
    p_tenant_id, p_venue_id, p_target_date, 'event',
    btrim(p_event_name), p_event_mode, p_replaces_service_period_id,
    COALESCE(p_target_input_mode, 'drivers'),
    p_manager_guest_target, p_manager_spend_per_guest_target,
    p_manager_revenue_override, 'operating', 'draft', 'manual', p_notes
  )
  RETURNING id INTO v_event_id;

  -- If replacement, mark the replaced service_period line(s) as replaced_by_event
  IF p_event_mode = 'replaces_period' AND p_replaces_service_period_id IS NOT NULL THEN
    UPDATE public.revenue_manager_target_lines
      SET line_status = 'replaced_by_event',
          zero_reason = COALESCE(zero_reason, 'Replaced by event: ' || btrim(p_event_name)),
          updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND venue_id = p_venue_id
      AND target_date = p_target_date
      AND line_type = 'service_period'
      AND service_period_id = p_replaces_service_period_id;
  END IF;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_revenue_event_with_replacement(uuid, uuid, date, text, text, uuid, text, numeric, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_revenue_event_with_replacement(uuid, uuid, date, text, text, uuid, text, numeric, numeric, numeric, text) TO service_role;
