create or replace function public.ft_assignable_members(_tenant_id uuid, _venue_id uuid)
returns table(user_id uuid, display_name text)
language sql stable security definer set search_path = public as $$
  select tm.user_id, coalesce(nullif(p.display_name, ''), 'Team member') as display_name
  from public.tenant_members tm
  left join public.profiles p on p.user_id = tm.user_id
  where tm.tenant_id = _tenant_id
    and public.ft_can_access_scope(auth.uid(), _tenant_id, _venue_id)
    and public.ft_can_access_scope(tm.user_id, _tenant_id, _venue_id)
    and tm.role not in ('platform_admin', 'super_admin')
  order by 2;
$$;
revoke execute on function public.ft_assignable_members(uuid, uuid) from public, anon;
grant execute on function public.ft_assignable_members(uuid, uuid) to authenticated;