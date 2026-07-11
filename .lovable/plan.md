# Client Onboarding Cockpit — Implementation Plan

Platform-admin-driven, white-glove onboarding at `/admin/clients/:tenantId/onboarding`. Resumable, skippable, operational-first.

## Sequencing (migrations → provisioning → cockpit shell → phases)

### Step 1 — Migrations (single batch)
- `tenant_onboarding` (tenant_id unique FK, current_phase int, steps jsonb `{step_key: {status, completed_at, completed_by, notes, skipped_reason}}`, created/updated).
- `organizations.industry text`.
- `tenants` add typed cols: `timezone`, `base_currency`, `country`, `financial_year_end date`, `financial_year_start_year int`. Backfill from `app_config` rows then drop those keys.
- `coa_templates` (id, code, name, industry, template jsonb) — seed one row: `f_and_b_hk` with a proper F&B COA (food/bev COGS split, service charge revenue, opex).
- `account_opening_balances` (tenant_id, organization_id, coa_account_id, as_at_date, debit numeric, credit numeric, status draft|posted, unique per (tenant, org, coa, as_at)).
- `customer_opening_balances` (mirror of `supplier_opening_balances`: tenant_id, organization_id, customer/name, invoice_no, invoice_date, due_date, original_amount, outstanding_amount, currency, is_credit_note, status).
- All: GRANTs (authenticated + service_role), RLS scoped via `has_role`/`is_tenant_member`, updated_at triggers.

### Step 2 — Provision-tenant edge function fixes
- Create `organizations` row (name=client_group, legal_name, industry) BEFORE venue insert.
- Venue insert receives `organization_id`.
- Stop writing `legal_entity_name`/`client_group_name`/`timezone`/`base_currency`/`country`/`financial_year_start` to `app_config`; write typed cols on `tenants` + org.
- COA seed reads from `coa_templates` (`f_and_b_hk`) instead of inline array.
- Seed `tenant_onboarding` row with phase=1, all steps `not_started`.

### Step 3 — Shared plumbing
- `src/hooks/useTenantOnboarding.ts` — fetch/update onboarding row, compute % complete per phase and overall, mark step, skip step, reopen step.
- `src/hooks/useCoaTemplates.ts`.
- `src/lib/onboardingSteps.ts` — canonical step definitions (5 phases, ~15 steps).

### Step 4 — Cockpit shell
- `src/pages/admin/ClientOnboarding.tsx` at `/admin/clients/:tenantId/onboarding`:
  - PageHeader + KpiGrid (Overall %, Current phase, Steps done, Skipped).
  - Phase accordion with step rows: status chip, last-updated, Open / Skip / Reopen actions.
  - Each step renders a dedicated subcomponent under `src/components/onboarding/steps/`.
- ClientDetail: replace 8-boolean fake checklist with prominent "Continue Onboarding" card (% + current phase + CTA). Remove duplicate venue panel and duplicate users panel.

### Step 5 — Phase 1 (Structure)
- `steps/OrganizationsStep.tsx` — reuse existing Orgs UI patterns; add industry, address, auditor.
- `steps/VenuesStep.tsx` — list venues per org; require organization_id.
- `steps/LocalisationStep.tsx` — timezone/currency/FY end + FY start year with live "First FY: 01 Apr 2025 → 31 Mar 2026, closing balance date 31 Mar 2025" summary. Writes to typed `tenants` cols.

### Step 6 — Phase 2 (Operational spine)
- `steps/ChartOfAccountsStep.tsx` — three CTAs: Load F&B template / Import CSV / Start blank. CSV: column mapping + validation preview + rejected-row report (pattern from Daily Sales upload).
- Surface the same "Load template" and "Import CSV" actions on `/finance/chart-of-accounts` header.
- `steps/SuppliersStep.tsx` — CSV import + manual add.
- `steps/RevenueStep.tsx` — revenue_sources + service_periods confirmation.

### Step 7 — Phase 3 (Go-live checklist)
- `steps/FirstSaleStep.tsx`, `steps/FirstInvoiceStep.tsx` — informational, deep-links to `/sales-data` and `/procurement`, auto-detect existence in DB to auto-tick.

### Step 8 — Phase 4 (Accounting completeness, optional)
- Phase header toggle: "Starting fresh — no prior system" → marks all Phase 4 steps skipped with reason.
- `steps/GLOpeningBalancesStep.tsx` — grouped-by-type editor over `account_opening_balances`, live Debit/Credit totals + Balanced badge, Save draft / Post (post disabled unless balanced).
- `steps/AROpeningStep.tsx` — customer_opening_balances editor + allocation tie-out vs AR control from GL.
- `steps/APOpeningStep.tsx` — deep-link to existing `/procurement/opening-balances` + allocation tie-out vs AP control.
- On phase completion: post one opening journal per organization (dr/cr per account), as-at = conversion date, flows to trial balance/ledger.

### Step 9 — Phase 5 (Team)
- `steps/TeamStep.tsx` — reuse `CreateUserDialog` in repeatable list; per-user permissions link to `/user-access`.
- Remove ClientDetail users panel.

### Step 10 — Audit cleanups (same batch)
- `/settings`: move Page Visibility into `/admin/system-configuration` as a section; keep theme switcher there as a small "Appearance" card (theme is per-user local pref, unchanged).
- Delete `/settings` route or redirect → `/admin/system-configuration#page-visibility`.
- Restyle `SystemConfiguration` and `Clients` KPI blocks to `KpiCard`/`KpiGrid`.

### Step 11 — Typecheck & report
- `tsgo`. Summary of migrations, files, and the new platform-admin experience.

## Technical Notes

- All new tables tenant-scoped, RLS via existing `is_tenant_member` + `has_role('platform_admin')`.
- Onboarding step keys are stable strings (`org_entities`, `venues`, `localisation`, `coa`, `suppliers`, `revenue`, `first_sale`, `first_invoice`, `gl_opening`, `ar_opening`, `ap_opening`, `team`).
- Skips stored with `{status:'skipped', skipped_reason, completed_at}`; UI shows amber chip + "Reopen" action; % complete counts skipped as done.
- CSV import uses same validation pattern as `useSalesData` upload: parse → preview → rejected rows report → confirm commit.
- `/pl-report` remains untouched.

## Out of Scope

- Any changes to `/pl-report` (PLReport.tsx).
- Theme system changes beyond relocating the switcher.
- Rewriting `/procurement/opening-balances` — reuse as-is, only add allocation tie-out block.
