create table public.venue_closures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  date date not null,
  reason text check (reason is null or char_length(reason) <= 100),
  note text check (note is null or char_length(note) <= 500),
  source text not null default 'manual' check (source in ('manual','your_team')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (venue_id, date)
);
grant select, insert, update, delete on public.venue_closures to authenticated;
grant all on public.venue_closures to service_role;
alter table public.venue_closures enable row level security;
create policy "Tenant members read closures" on public.venue_closures for select to authenticated
  using ((public.is_super_admin(auth.uid()) or public.user_has_tenant(auth.uid(), tenant_id)) and public.user_has_venue(auth.uid(), venue_id));
create policy "Admins and managers add closures" on public.venue_closures for insert to authenticated
  with check (created_by = auth.uid()
    and (public.is_super_admin(auth.uid()) or public.user_has_tenant(auth.uid(), tenant_id))
    and (public.has_role(auth.uid(),'admin'::public.app_role) or public.has_role(auth.uid(),'manager'::public.app_role))
    and public.user_has_venue(auth.uid(), venue_id)
    and exists (select 1 from public.venues v where v.id = venue_id and v.tenant_id = venue_closures.tenant_id));
create policy "Admins and managers update closures" on public.venue_closures for update to authenticated
  using ((public.is_super_admin(auth.uid()) or public.user_has_tenant(auth.uid(), tenant_id))
    and (public.has_role(auth.uid(),'admin'::public.app_role) or public.has_role(auth.uid(),'manager'::public.app_role))
    and public.user_has_venue(auth.uid(), venue_id))
  with check ((public.is_super_admin(auth.uid()) or public.user_has_tenant(auth.uid(), tenant_id))
    and public.user_has_venue(auth.uid(), venue_id));
create policy "Admins and managers remove closures" on public.venue_closures for delete to authenticated
  using ((public.is_super_admin(auth.uid()) or public.user_has_tenant(auth.uid(), tenant_id))
    and (public.has_role(auth.uid(),'admin'::public.app_role) or public.has_role(auth.uid(),'manager'::public.app_role))
    and public.user_has_venue(auth.uid(), venue_id));
create index venue_closures_tenant_date on public.venue_closures (tenant_id, date);

insert into public.venue_closures (tenant_id, venue_id, date, reason, source, created_by, created_at)
  select tenant_id, venue_id, date, left(reason, 100), 'your_team', created_by, created_at from public.venue_closed_days
  on conflict (venue_id, date) do nothing;

create table public.venue_closure_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  weekday smallint check (weekday is null or weekday between 0 and 6),
  start_date date not null,
  end_date date,
  reason text check (reason is null or char_length(reason) <= 100),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (weekday is not null or end_date is not null)
);
grant select, insert, update, delete on public.venue_closure_rules to authenticated;
grant all on public.venue_closure_rules to service_role;
alter table public.venue_closure_rules enable row level security;
create policy "Tenant members read closure rules" on public.venue_closure_rules for select to authenticated
  using ((public.is_super_admin(auth.uid()) or public.user_has_tenant(auth.uid(), tenant_id)) and public.user_has_venue(auth.uid(), venue_id));
create policy "Admins and managers add closure rules" on public.venue_closure_rules for insert to authenticated
  with check (created_by = auth.uid()
    and (public.is_super_admin(auth.uid()) or public.user_has_tenant(auth.uid(), tenant_id))
    and (public.has_role(auth.uid(),'admin'::public.app_role) or public.has_role(auth.uid(),'manager'::public.app_role))
    and public.user_has_venue(auth.uid(), venue_id)
    and exists (select 1 from public.venues v where v.id = venue_id and v.tenant_id = venue_closure_rules.tenant_id));
create policy "Admins and managers remove closure rules" on public.venue_closure_rules for delete to authenticated
  using ((public.is_super_admin(auth.uid()) or public.user_has_tenant(auth.uid(), tenant_id))
    and (public.has_role(auth.uid(),'admin'::public.app_role) or public.has_role(auth.uid(),'manager'::public.app_role))
    and public.user_has_venue(auth.uid(), venue_id));
create index venue_closure_rules_venue on public.venue_closure_rules (venue_id);
comment on table public.venue_closed_days is 'DEPRECATED: replaced by venue_closures';