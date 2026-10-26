create table public.venue_closed_days (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  date date not null,
  reason text check (reason is null or char_length(reason) <= 300),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (venue_id, date)
);
alter table public.venue_closed_days enable row level security;
grant select, insert, delete on public.venue_closed_days to authenticated;
grant all on public.venue_closed_days to service_role;
create policy "Members who see the venue read closed days" on public.venue_closed_days for select to authenticated
  using ((is_super_admin(auth.uid()) or user_has_tenant(auth.uid(), tenant_id)) and user_has_venue(auth.uid(), venue_id));
create policy "Members who see the venue mark closed days" on public.venue_closed_days for insert to authenticated
  with check (created_by = auth.uid() and (is_super_admin(auth.uid()) or user_has_tenant(auth.uid(), tenant_id)) and user_has_venue(auth.uid(), venue_id)
    and exists (select 1 from public.venues v where v.id = venue_id and v.tenant_id = venue_closed_days.tenant_id));
create policy "Members who see the venue unmark closed days" on public.venue_closed_days for delete to authenticated
  using ((is_super_admin(auth.uid()) or user_has_tenant(auth.uid(), tenant_id)) and user_has_venue(auth.uid(), venue_id));
create index venue_closed_days_tenant_date on public.venue_closed_days (tenant_id, date);