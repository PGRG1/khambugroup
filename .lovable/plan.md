# Admin & Onboarding Audit (no code changes)

## PART 1 — Admin / Platform Admin page-by-page verdicts

Note on structure: there is no dedicated `/platform` route prefix. "Platform Admin" is a sidebar section (`AppSidebar.tsx:539-550`) gated by `usePlatformAdmin` (`usePlatformAdmin.ts:9-32`) and currently exposes exactly one link — `/admin/clients`. Tenant `AdminRoute` and platform-admin gate are two unrelated auth checks sharing the `/admin/*` prefix — confusing convention (`App.tsx:151-157`).

| Route | File (LOC) | What it does today | Who uses it & when | Notes | VERDICT |
|---|---|---|---|---|---|
| `/settings` | `Settings.tsx` (71) | Theme switcher + page-visibility toggles | Tenant admin choosing which pages non-admins see | Only 2 features. Overlaps `/admin/system-configuration`; not on shared PageHeader/KpiCard | **MERGE** into System Configuration as a "Page Visibility" section; theme becomes a per-user profile pref |
| `/admin/system-configuration` | `SystemConfiguration.tsx` (927) | CRUD for Organizations, Venues, Service Periods, Revenue Sources, Procurement config | Tenant admin doing ongoing master-data setup | The real tenant-setup home; legacy custom `SectionShell`, not shared primitives; venue CRUD **duplicates** ClientDetail's venue section | **KEEP** — promote to the canonical "Setup" home; restyle to PageHeader/KpiCard |
| `/admin/ai-rules` | `AiRules.tsx` (357) | View/filter/edit/disable/delete AI-learned rules across bank recon / procurement / etc. | Ops or finance auditing AI automations | Fully functional CRUD + history; no overlap | **KEEP** (light restyle to shared primitives) |
| `/admin/clients` | `Clients.tsx` (315) | Platform-admin tenant list with KPI strip + "Add Client" (calls `provision-tenant`) | Bani platform admin provisioning/monitoring clients | Custom KPI cards not using shared `KpiCard` (`Clients.tsx:118-131`) | **KEEP** — restyle KPIs |
| `/admin/clients/:tenantId` | `ClientDetail.tsx` (414) | Setup checklist (8 booleans), cost-mode toggle, venue CRUD, user CRUD | Platform admin finishing tenant setup / support | Checklist is a stub — booleans, no persistence, no wizard. Venue add here inserts with **no `organization_id`** (`ClientDetail.tsx:132-146`) — actual correctness bug vs SystemConfiguration's model. Users panel duplicates `/user-access` (`ClientDetail.tsx:328-393`) | **REWORK** — replace the checklist with the real onboarding wizard (Part 2), remove duplicate venue/user blocks, deep-link into `/user-access` |
| `/user-access` | `UserAccessControl.tsx` (285) | User list/filter, invite, per-user page + venue permissions, preview-as | Tenant admin managing staff access | Duplicated in ClientDetail's Users section | **KEEP** — canonical user mgmt |
| `/activity-log` | `AuditLog.tsx` (145) | Paginated read-only `audit_log` viewer | Any authorised user for compliance/tracing | Uses shared conventions | **KEEP** |
| `/sales-data` | `DataPage.tsx` (162) | Sales entry/upload/scan + monthly KPIs | Ops staff — not admin but was in scope | Best example of shared PageHeader/KpiGrid conventions | **KEEP** (reference implementation for restyles) |

**Cuts / merges summary**
- **CUT**: duplicate Users panel in `ClientDetail.tsx:328-393` (use `/user-access`); duplicate Venue panel in `ClientDetail.tsx:132-157` (use SystemConfiguration).
- **MERGE**: `/settings` into `/admin/system-configuration`.
- **REWORK**: `ClientDetail` setup checklist → real onboarding wizard.
- **KEEP + light restyle**: `/admin/ai-rules`, `/admin/clients`, `/admin/system-configuration` (move to shared PageHeader/KpiCard).

## PART 2 — Onboarding wizard readiness (6 steps)

Current provisioning flow: `Clients.tsx` "Add Client" dialog → `supabase/functions/provision-tenant/index.ts` creates the `tenants` row, seeds a hardcoded 20-account COA (`provision-tenant:36-57, 336-345`), inserts **one** venue with **no org link** (`:178-186`), writes localisation to `app_config` key/value rows (`:304-316`), attaches/creates one tenant admin user (`:188-274`). After creation, the only guided surface is the 8-boolean checklist on `ClientDetail.tsx:172-184` — not persisted, not wired to real progress.

### Step 1 — Organization legal details (legal name, BR number, country, industry)
- ✅ Exists: `organizations` table with `legal_name`, `registration_number`, `incorporation_date`, `registered_address`, `auditor` (migration `20260711123115`); CRUD in `SystemConfiguration.tsx:74-174`.
- ❌ Missing: `industry` column; `provision-tenant` writes `legal_entity_name`/`country` to `app_config` (`:304-316`), **never creates an `organizations` row**.
- 🔧 Gap: two sources of truth (`app_config` vs `organizations`). Wizard needs provisioning to seed the first `organizations` row and add `industry` (+ optionally normalise `country` onto that row).

### Step 2 — Localisation (timezone, base currency HKD, FY end, start year)
- ✅ Exists at provisioning: `country`, `base_currency` (HKD default), `timezone` (Asia/Hong_Kong default), `financial_year_start` MM-DD (04-01 default) — `Clients.tsx:24-32,209-219`; persisted `provision-tenant:117-120,304-316`.
- ❌ Missing: **FY start year** (only a recurring MM-DD, no year-1 anchor); no post-creation UI to edit these — they live invisibly in `app_config`.
- 🔧 Gap: `app_config` is untyped k/v. Consider typed columns on `tenants` or `organizations`; add `fy_start_year` and a "Localisation" section in SystemConfiguration.

### Step 3 — Venues under each organization
- ✅ Exists: `SystemConfiguration.tsx:177-318` requires `organization_id`; `venues.organization_id` column present.
- ❌ Missing: provisioning creates a venue with no org link (`provision-tenant:178-186`); `ClientDetail.tsx:132-146` also inserts venues with no org link — real data-integrity hole.
- 🔧 Gap: `venues.organization_id` is nullable; wizard must (a) create the first organization, (b) create venues under it, (c) backfill for existing tenants before making the column NOT NULL.

### Step 4 — Chart of Accounts (F&B template vs CSV import)
- ✅ Exists partially: hardcoded 20-account seed in `provision-tenant:36-57,336-345`; full CRUD in `ChartOfAccounts.tsx` + `useChartOfAccounts.ts`.
- ❌ Missing: **no CSV import**, **no in-app "seed default template" action**, no template picker (bar / QSR / multi-concept).
- 🔧 Gap: no `coa_templates` table; the seed lives inlined in the edge function. Needs (a) a templates table or JSON asset, (b) a "Load template" and "Import CSV" action on `/finance/chart-of-accounts`.

### Step 5 — Opening / conversion balances
- ✅ Exists only for AP: `procurement/OpeningBalances.tsx` (621) captures go-live date, `supplier_opening_balances`, opening credit notes, `deposit_opening_balances`.
- ❌ Missing: **no general-ledger opening balances per COA account** (cash, fixed assets, equity…); **no AR opening balances**; **no reconciliation** between opening-balance totals and COA control accounts (AP control, AR control, cash).
- 🔧 Gap: needs new tables — `account_opening_balances` (per COA account per tenant, dated), `customer_opening_balances` (AR mirror of supplier version); wizard step must show a live tie-out panel: Σ supplier balances = AP control account opening; Σ customer balances = AR control account opening; Σ per-account = trial-balance zero. Biggest build in the wizard.

### Step 6 — Users & permissions invitation
- ✅ Exists end-to-end: `UserAccessControl.tsx` + `CreateUserDialog` → `create-user` edge function (`create-user:51-90`); provisioning also attaches/creates one admin (`provision-tenant:188-274`); `tenant_members`, `user_access_control`, `user_page_permissions`, `user_venue_access` all in place.
- ❌ Missing: no bulk-invite step in provisioning (only the first admin); duplicate Users panel in `ClientDetail.tsx:328-393`.
- 🔧 Gap: none significant — most mature step. Wizard just needs a "Invite teammates" screen that reuses `CreateUserDialog` in a repeatable list.

### Wizard readiness scorecard
| Step | Ready | Effort to wizard-ready |
|---|---|---|
| 1. Org legal details | Partial | Small — wire provisioning into `organizations`, add `industry`/`br_number` |
| 2. Localisation | Partial | Small — add FY start year, surface in Setup |
| 3. Venues under org | Partial | Small — enforce org link, backfill, remove duplicate ClientDetail UI |
| 4. COA template + CSV | Partial | Medium — add templates table + import UI |
| 5. Opening balances (GL + AR + AP + recon) | Weak (AP only) | **Large** — new tables + reconciliation UI. Biggest blocker |
| 6. User invitations | Strong | Trivial — reuse existing dialog |

**Recommended sequencing when we move to build**: (a) collapse duplicates (ClientDetail venue + user panels, `/settings`), (b) wire provisioning → `organizations`, (c) add COA template picker + CSV import, (d) build the GL/AR opening-balance module with reconciliation, (e) replace the ClientDetail checklist with the real 6-step wizard driving those pieces.

No files were modified.
