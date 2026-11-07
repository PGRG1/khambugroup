CREATE TABLE public.bani_team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  recipient_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  sender_name text NOT NULL,
  action_id uuid NOT NULL REFERENCES public.bani_pending_actions(id),
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE (action_id, recipient_id)
);
GRANT SELECT ON public.bani_team_messages TO authenticated;
GRANT ALL ON public.bani_team_messages TO service_role;
ALTER TABLE public.bani_team_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY recipient_read ON public.bani_team_messages FOR SELECT TO authenticated
USING (recipient_id = auth.uid() AND EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id = bani_team_messages.tenant_id AND m.user_id = auth.uid()) AND NOT EXISTS (SELECT 1 FROM public.tenant_user_access a WHERE a.tenant_id = bani_team_messages.tenant_id AND a.user_id = auth.uid() AND a.status IN ('suspended', 'removed')));
CREATE INDEX bani_team_messages_unread ON public.bani_team_messages (tenant_id, recipient_id, created_at) WHERE read_at IS NULL;
CREATE FUNCTION public.bani_team_messages_read(p_tenant_id uuid, p_ids uuid[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.bani_team_messages SET read_at = now()
  WHERE tenant_id = p_tenant_id AND recipient_id = auth.uid() AND id = ANY(p_ids) AND read_at IS NULL
    AND EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id = p_tenant_id AND m.user_id = auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.tenant_user_access a WHERE a.tenant_id = p_tenant_id AND a.user_id = auth.uid() AND a.status IN ('suspended', 'removed'));
$$;
REVOKE ALL ON FUNCTION public.bani_team_messages_read(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bani_team_messages_read(uuid, uuid[]) TO authenticated;
