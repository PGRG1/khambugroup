
create or replace function public.ft_can_access_scope(_user_id uuid, _tenant_id uuid, _venue_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.user_has_tenant(_user_id, _tenant_id) and (
    case when _venue_id is null then
      not exists (select 1 from public.user_venue_access uva join public.venues v on v.id = uva.venue_id where uva.user_id = _user_id and v.tenant_id = _tenant_id)
      and not exists (select 1 from public.venue_memberships vm join public.venues v on v.id = vm.venue_id where vm.user_id = _user_id and v.tenant_id = _tenant_id)
    else exists (select 1 from public.venues v where v.id = _venue_id and v.tenant_id = _tenant_id) and public.user_has_venue(_user_id, _venue_id)
    end);
$$;
revoke execute on function public.ft_can_access_scope(uuid, uuid, uuid) from public, anon;
grant execute on function public.ft_can_access_scope(uuid, uuid, uuid) to authenticated, service_role;

create table public.finance_team_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete set null,
  venue_label text not null,
  review_type text not null check (review_type in ('daily','weekly')),
  period_start date not null,
  period_end date not null,
  comparison_start date,
  comparison_end date,
  trigger_source text not null check (trigger_source in ('manual','scheduled')),
  status text not null default 'running' check (status in ('running','completed','failed')),
  ai_status text check (ai_status in ('ai','deterministic_no_key','deterministic_ai_failed','deterministic_ai_rejected')),
  ai_model text,
  context jsonb not null default '{}'::jsonb,
  specialists jsonb not null default '[]'::jsonb,
  synthesis jsonb not null default '{}'::jsonb,
  prior_actions jsonb not null default '[]'::jsonb,
  error text,
  generated_by uuid,
  started_at timestamptz not null default now(),
  generated_at timestamptz
);
create unique index finance_team_reviews_one_running on public.finance_team_reviews
  (tenant_id, coalesce(venue_id, '00000000-0000-0000-0000-000000000000'::uuid), review_type, period_start) where status = 'running';
create unique index finance_team_reviews_scheduled_once on public.finance_team_reviews
  (tenant_id, coalesce(venue_id, '00000000-0000-0000-0000-000000000000'::uuid), review_type, period_start) where status = 'completed' and trigger_source = 'scheduled';
create index finance_team_reviews_scope on public.finance_team_reviews (tenant_id, venue_id, generated_at desc);
alter table public.finance_team_reviews enable row level security;
grant select on public.finance_team_reviews to authenticated;
grant all on public.finance_team_reviews to service_role;
create policy "ft reviews readable in scope" on public.finance_team_reviews for select to authenticated
  using (public.ft_can_access_scope(auth.uid(), tenant_id, venue_id));

create or replace function public.ft_reviews_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Finance team review snapshots cannot be deleted'; end if;
  if old.status <> 'running' then raise exception 'Finance team review snapshots are immutable once finished'; end if;
  if new.tenant_id <> old.tenant_id or new.venue_id is distinct from old.venue_id or new.review_type <> old.review_type
     or new.period_start <> old.period_start or new.period_end <> old.period_end then
    raise exception 'Review scope cannot change';
  end if;
  return new;
end $$;
create trigger ft_reviews_immutable before update or delete on public.finance_team_reviews
  for each row execute function public.ft_reviews_immutable();

create table public.finance_team_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete set null,
  review_id uuid not null references public.finance_team_reviews(id),
  finding_key text not null,
  specialist text not null,
  title text not null,
  recommendation text not null,
  evidence jsonb not null default '[]'::jsonb,
  assignee_id uuid,
  due_date date,
  status text not null default 'open' check (status in ('open','completed')),
  accepted_by uuid not null,
  accepted_at timestamptz not null default now(),
  completed_by uuid,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (review_id, finding_key)
);
create index finance_team_actions_scope on public.finance_team_actions (tenant_id, venue_id, status);
alter table public.finance_team_actions enable row level security;
grant select, insert, update on public.finance_team_actions to authenticated;
grant all on public.finance_team_actions to service_role;
create policy "ft actions readable in scope" on public.finance_team_actions for select to authenticated
  using (public.ft_can_access_scope(auth.uid(), tenant_id, venue_id));
create policy "ft actions accepted in scope" on public.finance_team_actions for insert to authenticated
  with check (accepted_by = auth.uid() and public.ft_can_access_scope(auth.uid(), tenant_id, venue_id)
    and exists (select 1 from public.finance_team_reviews r where r.id = review_id and r.status = 'completed'
      and r.tenant_id = finance_team_actions.tenant_id and r.venue_id is not distinct from finance_team_actions.venue_id));
create policy "ft actions updated in scope" on public.finance_team_actions for update to authenticated
  using (public.ft_can_access_scope(auth.uid(), tenant_id, venue_id))
  with check (public.ft_can_access_scope(auth.uid(), tenant_id, venue_id));

create table public.finance_team_action_events (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.finance_team_actions(id) on delete cascade,
  tenant_id uuid not null,
  venue_id uuid,
  event text not null,
  actor_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.finance_team_action_events enable row level security;
grant select on public.finance_team_action_events to authenticated;
grant all on public.finance_team_action_events to service_role;
create policy "ft action events readable in scope" on public.finance_team_action_events for select to authenticated
  using (public.ft_can_access_scope(auth.uid(), tenant_id, venue_id));

create or replace function public.ft_actions_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare ev text;
begin
  if new.assignee_id is not null and not public.ft_can_access_scope(new.assignee_id, new.tenant_id, new.venue_id) then
    raise exception 'Assignee is not an authorized team member for this venue';
  end if;
  if tg_op = 'UPDATE' then
    if new.tenant_id <> old.tenant_id or new.venue_id is distinct from old.venue_id or new.review_id <> old.review_id
       or new.finding_key <> old.finding_key or new.accepted_by <> old.accepted_by or new.accepted_at <> old.accepted_at
       or new.recommendation <> old.recommendation or new.title <> old.title or new.evidence <> old.evidence then
      raise exception 'Only assignee, due date and status can change on an accepted action';
    end if;
    if new.status = 'completed' and old.status = 'open' then
      new.completed_by := auth.uid(); new.completed_at := now(); ev := 'completed';
    elsif new.status = 'open' and old.status = 'completed' then
      new.completed_by := null; new.completed_at := null; ev := 'reopened';
    else ev := 'updated'; end if;
    new.updated_at := now();
    insert into public.finance_team_action_events(action_id, tenant_id, venue_id, event, actor_id, details)
    values (new.id, new.tenant_id, new.venue_id, ev, auth.uid(), jsonb_build_object(
      'assignee_from', old.assignee_id, 'assignee_to', new.assignee_id, 'due_from', old.due_date, 'due_to', new.due_date,
      'status_from', old.status, 'status_to', new.status));
  end if;
  return new;
end $$;
create trigger ft_actions_guard before insert or update on public.finance_team_actions
  for each row execute function public.ft_actions_guard();

create or replace function public.ft_actions_log_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.finance_team_action_events(action_id, tenant_id, venue_id, event, actor_id, details)
  values (new.id, new.tenant_id, new.venue_id, 'accepted', new.accepted_by,
    jsonb_build_object('assignee_to', new.assignee_id, 'due_to', new.due_date));
  return new;
end $$;
create trigger ft_actions_log_insert after insert on public.finance_team_actions
  for each row execute function public.ft_actions_log_insert();

create table public.finance_team_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete cascade,
  timezone text not null default 'Asia/Hong_Kong',
  daily_enabled boolean not null default false,
  daily_hour int not null default 8 check (daily_hour between 0 and 23),
  weekly_enabled boolean not null default false,
  weekly_day int not null default 1 check (weekly_day between 0 and 6),
  weekly_hour int not null default 9 check (weekly_hour between 0 and 23),
  last_daily_run_at timestamptz,
  last_weekly_run_at timestamptz,
  last_error text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create unique index finance_team_schedules_scope on public.finance_team_schedules
  (tenant_id, coalesce(venue_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.finance_team_schedules enable row level security;
grant select, insert, update on public.finance_team_schedules to authenticated;
grant all on public.finance_team_schedules to service_role;
create policy "ft schedules readable in scope" on public.finance_team_schedules for select to authenticated
  using (public.ft_can_access_scope(auth.uid(), tenant_id, venue_id));
create policy "ft schedules insert in scope" on public.finance_team_schedules for insert to authenticated
  with check (updated_by = auth.uid() and public.ft_can_access_scope(auth.uid(), tenant_id, venue_id));
create policy "ft schedules update in scope" on public.finance_team_schedules for update to authenticated
  using (public.ft_can_access_scope(auth.uid(), tenant_id, venue_id))
  with check (updated_by = auth.uid() and public.ft_can_access_scope(auth.uid(), tenant_id, venue_id));

-- Scheduler credential: locked table, no client policies, service role only.
create table public.finance_team_scheduler_tokens (
  id int primary key default 1 check (id = 1),
  token text not null,
  created_at timestamptz not null default now()
);
alter table public.finance_team_scheduler_tokens enable row level security;
revoke all on public.finance_team_scheduler_tokens from anon, authenticated;
grant all on public.finance_team_scheduler_tokens to service_role;

create or replace function public.finance_team_scheduler_enabled() returns boolean
language sql stable security definer set search_path = public, cron as $$
  select exists (select 1 from cron.job where jobname = 'finance-team-scheduled-reviews' and active);
$$;
revoke execute on function public.finance_team_scheduler_enabled() from public, anon;
grant execute on function public.finance_team_scheduler_enabled() to authenticated, service_role;
