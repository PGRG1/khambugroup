create table public.purchasing_budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  category text not null check (char_length(category) <= 100),
  amount numeric not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique nulls not distinct (tenant_id, venue_id, month, category)
);
grant select, insert, update, delete on public.purchasing_budgets to authenticated;
grant all on public.purchasing_budgets to service_role;
alter table public.purchasing_budgets enable row level security;
create policy "Tenant members read budgets" on public.purchasing_budgets for select to authenticated
  using (public.is_super_admin(auth.uid()) or public.user_has_tenant(auth.uid(), tenant_id));
create policy "Admins add budgets" on public.purchasing_budgets for insert to authenticated
  with check ((public.is_super_admin(auth.uid()) or public.user_has_tenant(auth.uid(), tenant_id))
    and public.has_role(auth.uid(),'admin'::public.app_role)
    and (venue_id is null or public.user_has_venue(auth.uid(), venue_id)));
create policy "Admins update budgets" on public.purchasing_budgets for update to authenticated
  using ((public.is_super_admin(auth.uid()) or public.user_has_tenant(auth.uid(), tenant_id))
    and public.has_role(auth.uid(),'admin'::public.app_role)
    and (venue_id is null or public.user_has_venue(auth.uid(), venue_id)))
  with check (public.is_super_admin(auth.uid()) or public.user_has_tenant(auth.uid(), tenant_id));
create policy "Admins remove budgets" on public.purchasing_budgets for delete to authenticated
  using ((public.is_super_admin(auth.uid()) or public.user_has_tenant(auth.uid(), tenant_id))
    and public.has_role(auth.uid(),'admin'::public.app_role)
    and (venue_id is null or public.user_has_venue(auth.uid(), venue_id)));
create index purchasing_budgets_tenant_month on public.purchasing_budgets (tenant_id, month);

create table public.purchasing_budget_changes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  category text not null check (char_length(category) <= 100),
  old_amount numeric,
  new_amount numeric not null check (new_amount >= 0),
  reason text check (reason is null or char_length(reason) <= 500),
  changed_by uuid not null default auth.uid(),
  changed_at timestamptz not null default now()
);
grant select, insert on public.purchasing_budget_changes to authenticated;
grant all on public.purchasing_budget_changes to service_role;
alter table public.purchasing_budget_changes enable row level security;
create policy "Tenant members read budget changes" on public.purchasing_budget_changes for select to authenticated
  using (public.is_super_admin(auth.uid()) or public.user_has_tenant(auth.uid(), tenant_id));
create policy "Admins log budget changes" on public.purchasing_budget_changes for insert to authenticated
  with check (changed_by = auth.uid()
    and (public.is_super_admin(auth.uid()) or public.user_has_tenant(auth.uid(), tenant_id))
    and public.has_role(auth.uid(),'admin'::public.app_role)
    and (venue_id is null or public.user_has_venue(auth.uid(), venue_id)));
create index purchasing_budget_changes_tenant_month on public.purchasing_budget_changes (tenant_id, month, category);