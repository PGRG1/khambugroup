REVOKE ALL ON public.bani_team_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.bani_team_messages TO authenticated;
GRANT ALL ON public.bani_team_messages TO service_role;
REVOKE ALL ON FUNCTION public.bani_team_messages_read(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bani_team_messages_read(uuid, uuid[]) TO authenticated;