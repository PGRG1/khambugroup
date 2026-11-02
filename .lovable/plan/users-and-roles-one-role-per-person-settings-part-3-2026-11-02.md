# Users and Roles — one role per person (Settings part 3)

## What exists today (checked)
- Four role sources: `tenant_members.role` (tenant_admin / platform_admin / member), `tenant_members.purchasing_role` (display only), `user_access_control.position` (owner/gm/finance/staff/viewer), `forecast_approvers` (2 rows). Plus a global `user_roles` (admin/manager) that is not per business.
- Per-page switches in `user_page_permissions` (10 page keys incl. kpis, with sidebar/access/authority/hidden actions).
- `user_venue_access` has 0 rows, so today everyone sees every venue.
- 49 `hr_employees`; none are linked to a login in practice.
- Database rules: 398 policies; 289 only check "member of this business", 77 check the global admin/manager role, 19 check business admin, 36 check venue. Page switches are enforced only in the app (and in four Finance-team tables), not in the database.
- Current people: KHAMBU 7 logins (1 business admin, 1 platform admin, 5 members with mixed position/purchasing role); QA 1 (business admin); Test client 1.

## Steps (each one shipped and checked in QA before the next)

**1. New tables, alongside the old ones (nothing removed)**
- `tenant_roles`: tenant, key (owner, operations_manager, general_manager, assistant_manager, head_chef, bar_manager, finance, front_of_house, back_of_house), name, money level, area levels (Revenue, Purchasing, Stock & menu, People, Payroll, Expenses, Finance, Settings, each 0–3), job titles list. The nine roles are seeded for every business, including new ones (provisioning). They can be edited but not deleted, and the Owner role can't be lowered below full access.
- `tenant_user_access`: one row per person per business: role, all-venues flag, team record (`hr_employees` id), reports-to (another login in the same business), status (active / suspended / review needed), who changed it and when.
- `tenant_user_venues`: the venues a person can see when "All venues" is off. An empty list then means no venues, never all venues.
- `tenant_user_exceptions`: per-person overrides (area or money level), with a reason, who set it and when. Shown as "Exception" everywhere.
- `tenant_access_changes`: history of every role, venue, exception and status change.
- All with grants and row rules: everyone in the business can read the role list; only people with Settings ≥ Edit can change them; Owner changes need an Owner.

**2. One server-side source of truth**
New database functions every rule and server function calls:
- `access_level(tenant, area)` returns 0–3 (the role, then the exception on top).
- `money_level(tenant)` returns nothing / sales / costs / sales_costs / everything.
- `can_see_venue(tenant, venue)`: all-venues flag or listed venue.
- `is_owner(tenant)`.
While the new tables are being filled, the functions fall back to today's behaviour so nobody gets locked out.

**3. Move existing users over (data step, reviewed by you)**
- business admin or position owner → Owner. A platform admin keeps platform rights separately and gets Owner in the businesses they have entered.
- position gm (or purchasing role manager) → General manager.
- finance → Finance.
- staff → Front of house.
- viewer with no other signal → "Review needed" status, with today's access kept until you choose a role.
- Venues: everyone gets "All venues", which matches today's empty venue list.
- Forecast approvers and "approve" authority become per-person Approve exceptions only where the new role would not already approve, so nobody gains or loses approvals silently.
- Team records: suggest a link by matching name or email. Nothing is saved until confirmed.
- Before applying, I send you a list: person, old values, new role, and anyone who doesn't map cleanly. From what's there today that is likely 3–4 KHAMBU members: the "viewer + purchasing staff" ones and the "position staff + purchasing manager" one.

**4. Enforcement in the database (the part that makes it real)**
- Map each table to an area, e.g. sales records → Revenue; invoices, suppliers, GRNs → Purchasing; stock and menu → Stock & menu; shifts and team → People; payroll → Payroll; bills → Expenses; journals, bank, reports → Finance; settings tables → Settings.
- Read access needs View or higher in that area plus venue access where the table has a venue. Writes need Edit. Approval actions (invoice approval, bill approval, payroll approval, forecast approval, month close, expense month approval) need Approve, checked inside the existing approval functions, not only in rules.
- Money figures: staff must not get them from the server.
  - Money columns live mostly in sales, invoices, payroll and finance tables. Roles with money level "nothing" get no read access to those tables at all, so the server never returns them.
  - Where staff legitimately need a non-money part (e.g. a rota without pay rates, stock counts without values), they read through safe views or functions that leave out the money columns. "Sales only" and "Costs only" are applied the same way: sales tables vs cost/purchase tables; pay only at "everything".
- Done in batches by area, with the old rules left in place until each batch passes QA checks for every role.

**5. Enforcement in server functions**
- A shared `_shared/access.ts` helper calls the same database functions. Every function that uses the service key (Bani chat, finance team, alerts, scanners, payroll draft, stock count, recipe drafts, create-user, provision-tenant) checks area, venue and money level before reading or writing. Bani's answers, cards and push notifications are filtered by the asker's money level, e.g. no sales figures in a Front of house person's alerts.
- Stays as now: the existing propose/confirm cards still re-check on confirm, now against the new levels.

**6. App side**
- One `useAccess()` hook replaces `usePagePermissions`, the hidden-action switches, the forecast approver checks and the purchasing role. The menu, page gates and buttons read it.
- The menu is only for convenience; the database and server functions are what actually block.
- Old switches (Date Range Picker, etc.) are retired: a role either sees a page or not.

**7. Settings → Users screens**
- **People tab:**
  - Columns: Person, Role (money level underneath), Venues, Reports to, Status, Edit.
  - An amber note "Logins aren't linked to your team records yet" with "Link logins": matches by name, and you confirm each link before it's saved.
- **Roles tab:** the nine roles with Sees money and Job titles. Clicking one opens a pop-up with the money choice and a Hidden / View / Edit / Approve control per area. Owner stays locked at full access.
- **Edit user pop-up:**
  - Fields: Team record, Role, Venues ("All venues" or specific ones), Reports to (no loops), Status.
  - "See what {role} can do" (read-only summary) and "Exceptions for {name}" (marked clearly).
  - Remove access: ends this business's access only and keeps history.
- **Invite:**
  - Pick someone from the team list, or type an email for someone outside it. From the team list, the role is suggested from the job title using your mapping, and the venue and reports-to are prefilled.
  - Accepting the invite creates access in the inviting business only: no global admin role, no other business.

**8. Switch over, then tidy up later**
- The new system goes live in QA, then KHAMBU after you review the mapping list.
- Old columns and tables stay readable, marked as retired. They are removed in a later, separate change only after you've checked the new system live.

## What could break
- **Lock-outs:** a wrong mapping or missing venue row could hide pages or data. Guarded by the "review needed" fallback to today's access, the "All venues" default, and Owners always being exempt.
- **Server functions using the service key:** they skip database rules, so any function not updated would still leak money figures. Each one is listed and checked against a Front of house test login.
- **Global admin/manager role (77 rules):** it currently grants rights across all businesses. Moving those rules to per-business levels must keep platform admins working, so platform rights stay separate.
- **Pages that join many tables** (Landing, Purchasing Overview, Finance reports, Bani) may show blanks for roles without money access. They need explicit "not available for your role" states instead of errors.
- **Reports, push alerts and exports** must use the same checks, or figures could leak through downloads.
- **Approvals:** forecast approval, invoice approval, payroll and month close move from separate lists to Approve. Existing approvers are kept as exceptions.
- **Performance:** level checks on every row. The functions are cached per request and indexed by business and user.

## Testing (when building)
- Only in the QA business (ff000000-0000-4000-8000-000000000001), using its existing login.
- Role checks are run by switching that login's role inside a test transaction that is rolled back, so no new users or businesses are created.
- For each of the nine roles: menu, page gates, a direct database read of a sales, invoice and payroll row, and a Bani question about sales. Expected: staff get no money figures.
- Unit tests for the default level table, job-title mapping, the migration mapping and the "empty venues ≠ all venues" rule.

## Technical details
- Levels are stored as smallint 0–3 per area (one column per area) plus a money enum, which keeps rules simple. Exceptions use the same shape with nullable columns.
- `access_level` / `money_level` / `can_see_venue` are SECURITY DEFINER, STABLE, with search_path set, and read `auth.uid()`. Policies call them, e.g. `access_level(tenant_id,'revenue') >= 1 AND can_see_venue(tenant_id, venue_id)`.
- Job-title mapping lives in a pure util shared by the UI and the invite suggestions, with matching ignoring case and spacing.
- Rollout order: tables and seeding → functions with fallback → migration list (you approve) → server functions → database rules by area → UI → retire old screens.
