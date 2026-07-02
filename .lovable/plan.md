# Platform Admin & User Access Control System

Build venue-scoped access control, expanded page permissions, and a full Client Detail page for platform admins.

## 1. Database migration

Create `user_venue_access`:
- `id`, `tenant_id` FK tenants CASCADE, `user_id` FK auth.users CASCADE, `venue_id` FK venues CASCADE, `created_at`
- UNIQUE (tenant_id, user_id, venue_id)
- GRANT SELECT/INSERT/UPDATE/DELETE to `authenticated`, ALL to `service_role`
- RLS SELECT: `is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id)`
- RLS ALL: same + `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')`

Add to `tenants`: `cost_reporting_mode text NOT NULL DEFAULT 'combined' CHECK (cost_reporting_mode IN ('combined','by_venue'))`.

**Data backfill for renamed page key** (idempotent):
```sql
UPDATE public.user_page_permissions SET page_key = 'kpis' WHERE page_key = 'kpi-management';
UPDATE public.user_page_permissions SET page_key = 'kpis' WHERE page_key = 'kpis'; -- no-op, keeps idempotent
```

## 2. `src/utils/permissions.ts`

Replace `ALL_PAGES` with 10 sections: revenue, kpis, finance, procurement, expenses, payments, bank, pettycash, people, admin. Rewrite `PAGE_ACTIONS` (kpi actions move under `kpis`; admin `[]`). Add `venue_ids: string[]` to `UserAccessRecord`.

## 3. `supabase/functions/provision-tenant/index.ts`

Replace `DEFAULT_PAGES` with the 10 new keys. Provisioned admin gets `show_in_sidebar: true, can_access: true, authority: 'admin', hidden_actions: []` for each.

## 4. `src/components/AppSidebar.tsx`

Add helper:
```
const canSeeSection = (pageKey: string) => {
  if (isPlatformAdmin) return true;
  if (isAdmin && !isPreviewActive) return true;
  return showInSidebar(pageKey);
};
```
Replace `showFinance/showProcurement/showBank/showPayments/showPettyCash/showHR` with `canSeeSection("finance"|"procurement"|"bank"|"payments"|"pettycash"|"people")`. Keep `showAdmin` and `showPlatform` unchanged.

## 5. `src/pages/admin/Clients.tsx`

- Rows: `onClick` → `/admin/clients/:id`, cursor-pointer + hover bg.
- Batched per-tenant fetches: user count, bank account count, invoice count.
- New "Setup" column between Users and Status: 4-point score (venues>0, users>1, banks>0, invoices>0). `w-20 h-1.5` progress bar, amber fill if <3 else emerald; `N/4 steps` in 10px muted below.
- Ghost "Manage →" button in Actions.
- KPI cards above table: Total clients · Active · In setup · Total venues.

## 6. `src/pages/admin/ClientDetail.tsx` (new) + route in `App.tsx`

Route `/admin/clients/:tenantId`. Gate with `usePlatformAdmin`; redirect to `/` otherwise.

Fetch: tenant, venues, users (profiles + user_access_control + tenant_members scoped to tenant), COA count, bank accounts count, suppliers count, invoices count + last invoice date, opening balances count, payment processors count.

Header: back "← Clients", tenant name, subtitle `slug · currency · timezone`, status badge; "Edit details" sheet (name, legal entity, country, currency, timezone, FY start) + red ghost "Suspend" with confirm.

Amber-underline tabs: Overview / Venues / Users / Settings.

**Overview** — two columns:
- Left card-glass "Setup checklist" — 8 items (Tenant created ✓, Venues, COA, Bank accounts, Suppliers, Users >1, Opening balances, Payment processors). ✓ or amber with "Complete" button linking to System Configuration or switching tab.
- Right: "Key stats" (venues, users, invoices, last invoice date) + "Quick actions" ghost buttons: Add user, Add venue, View as client admin (toast stub), View activity log (stub).

**Venues** — "Add venue" primary button opens dialog: Name (required), Type Select (Restaurant/Bar/Cafe/Other), Seats (optional). Insert with `tenant_id`; sonner toast. List venues card-glass with Edit (prefill) and Deactivate (`is_active=false`).

**Users** — "Add user" opens `CreateUserDialog` with new `tenantId` prop. Table: User (name+email) | Position | Venues (names from `user_venue_access` else "All venues") | Status | Actions. "Edit access" opens `UserEditorPanel` with `tenantId` prop.

**Settings** — two side-by-side card-glass:
- Tenant details table + "Edit details" (same sheet as header).
- "Cost reporting mode" radio (Combined group-level / By venue allocated) writing to `tenants.cost_reporting_mode` immediately on change.

## 7. `src/components/access-control/UserEditorPanel.tsx`

Add `tenantId: string` prop. Fetch venues for that tenant and existing `user_venue_access` for `(user_id, tenant_id)`.

Top "Venue access" section with 11px muted subtitle. Checkbox per venue. When none checked, show muted "No restrictions — user sees all venues."

On save (after page permissions): `delete user_venue_access where user_id=... AND tenant_id=...`, then insert one row per checked venue (none checked → insert nothing).

Update pages list to iterate the new 10-item `ALL_PAGES`. Per section: name, "Show in sidebar" toggle, Authority select, Hidden actions checkboxes from `PAGE_ACTIONS[key]`; skip actions row when empty.

## 8. `src/pages/UserAccessControl.tsx`

Add "Venues" column between Position and Status. Fetch `user_venue_access` joined to venues: none → emerald "All venues" badge; else amber badge with up to 2 venue names + "+ N more". Pass `tenantId` from `useActiveTenant()` into `CreateUserDialog` and downstream create-user body.

## Design

`card-glass`, amber underline tabs, `text-[11px] uppercase tracking-wider text-muted-foreground` headers, alternating `bg-muted/30` rows, sonner toasts, `← Label` back links.

## Files

**Created**: `src/pages/admin/ClientDetail.tsx` + migration.
**Modified**: `permissions.ts`, `admin/Clients.tsx`, `UserEditorPanel.tsx`, `UserAccessControl.tsx`, `AppSidebar.tsx`, `App.tsx`, `provision-tenant/index.ts`.
