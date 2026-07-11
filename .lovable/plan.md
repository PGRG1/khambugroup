# HR Section Audit — Findings & Prioritized Plan

Scope: `/hr/employees`, `/hr/org-chart`, `/hr/schedule`, `/hr/leave`, `/hr/payroll` and their components/hooks. No code changes proposed here.

---

## PART 1 — Usability Audit (per page, click-count against "less clicks, more output")

### `/hr/employees` — Employee Directory
Core jobs and current cost:
- **See an employee's full profile (pay, leave, docs, history):** ~4 clicks. Row → Edit → switch to "History" tab → close, then leave the page entirely to see leave balance (`/hr/leave`) and pay (`/hr/payroll`). Nothing lives on the profile.
- **Add employee:** 1 click ✅.
- **Manage departments/holidays:** requires jumping between three separate dialogs from the same header (Depts, Holidays, History are all modals) — modal-inside-modal for History (Employee dialog → History tab → open history record dialog).

Violations: no true employee profile page; four dialogs on one screen; tabbed dialog for details+history; no PageHeader / KpiGrid; no venue-grouped view (Assembly / Caliente / Hanabi / Events); no `StatusBadge`; no URL-persisted filters.

### `/hr/org-chart`
Read-only, low traffic. Not tenant-checked at hook level (relies solely on RLS). Purely decorative today — no drill-through from a node to the employee profile ⇒ dead-end page.

### `/hr/schedule` — Attendance + Weekly Schedule
Core jobs:
- **See who's working today across all venues:** currently the landing view is a week grid per venue, not "today across venues." ~2–3 clicks to change scope; no cross-venue "today" board.
- **Add/edit a shift:** 1 click → modal (OK).
- **Copy previous week:** 2 clicks (button + confirm) — fine.
- **Reconcile planned vs actual hours:** buried in `ActualsComparisonView`; no variance KPI on landing.

Violations: massive component (`WeeklyScheduleView` 882 LOC, `AttendanceTab` 693 LOC) mixes planning + attendance + leave overlays; no PageHeader/KPIs (headcount today, hours planned, hours actual, variance, absentees); no leave calendar view; no mobile-first card layout for shift managers on a phone.

### `/hr/leave`
Core jobs:
- **Approve a pending leave request:** land on "Balance Overview" tab (default) → switch to Requests tab → find row → approve. That's 3 clicks to reach a pending queue that should be one-click / on landing.
- **Check one employee's balance:** on Overview tab, but no per-employee filter persisted; no click-through from an employee row to their ledger.
- **See who's on leave this week/month across venues:** no calendar view at all.

Violations: three-tab layout hides the highest-frequency action (approvals); no leave calendar; no venue grouping; balances not surfaced on the employee profile.

### `/hr/payroll`
Core jobs:
- **Run this month's payroll:** period picker + Post Accrual button — mostly OK.
- **Record salary/MPF payment:** 1 click to open `PayrollPaymentDialog` — OK, but the dialog handles selection + method + bank + posting in a single scroll (heavy).
- **See payroll cost vs revenue by venue:** **not available.** No labor-cost-% view, despite sales data being in the app.
- **Employee pay detail:** click row → modal with detail table (nested actions). No link to the ledger entry that was posted.

Violations: no KPI strip (gross, net, MPF, headcount, avg salary, labor cost %); no venue breakdown; no link from a paid row → the journal entry it created; the "detail modal" is a modal-inside-a-table (owner's exact anti-pattern).

### Cross-cutting UI debt
- None of the HR pages use `PageHeader`, `KpiGrid`, `StatusBadge`, `TableSkeleton`, `EmptyState`, `fmtHKWhole`, or URL-persisted filters — inconsistent with the just-shipped Finance/Procurement/Revenue design language.
- Loading state everywhere is the same `<p>Loading...</p>`.
- No mobile card layouts; the schedule and payroll grids are effectively desktop-only.
- Sub-pages have their own `<h1>` blocks instead of a shared header component.

---

## PART 2 — Competitive Gap Analysis (multi-venue F&B, HK)

Ranked by **value ÷ effort** for a small group; enterprise bloat excluded.

**Highest ROI — build first**
1. **People Dashboard `/hr` landing page.** Headcount by venue, on-shift now, pending leave approvals, hours planned vs actual this week, month-to-date labor cost + labor cost % of revenue, upcoming contract/visa/HKID expiries, upcoming anniversaries/probation ends. Single-glance answer to "how's the team?".
2. **Unified Employee Profile `/hr/employees/:id`.** Everything on one page: personal, employment history, current comp, YTD earnings, leave balances + ledger, upcoming shifts, documents. Kills 3–4 cross-page hops.
3. **Labor Cost % by venue** (we already have sales in the same DB — big unlock). Weekly + monthly, planned vs actual.
4. **Leave calendar `/hr/leave` (calendar view + approvals queue on landing).** Cross-venue month view; approvals surfaced above the fold.
5. **Today Board on `/hr/schedule`.** Default view: "Today, all venues" with on-shift, late, no-show, on-leave — the operational answer a manager needs at 10am.
6. **Roster vs Actual variance.** Per-shift and per-week variance surfaced as a KPI, not buried in a sub-view.

**Medium ROI**
7. **Document & expiry tracking** (HKID, visa/work permit, contract end, food handler cert). Dashboard tile + per-employee section.
8. **Onboarding / offboarding checklists** (lightweight — a checklist template per venue).
9. **Compensation history** on the employee profile (raises, role changes) — partly present via `hr_employee_history`; needs to be surfaced.
10. **Payroll → GL drill-through** (link each posted payroll row to its `journal_entry_id`).

**Skip / defer (enterprise bloat)**
- Performance reviews, 360 feedback, learning paths, benefits admin, applicant tracking. Not what this owner needs.

---

## PART 3 — Data / Logic Check

Concrete issues found:

- **`usePayrollPaymentBatches.ts` has NO tenant scoping.** `hr_payroll_payment_batches` and `hr_payroll_payment_batch_lines` are queried without `.eq('tenant_id', tenantId)` on read, and insert doesn't set `tenant_id`. Relies purely on RLS — inconsistent with the finance pass rule and will silently return empty (or fail insert) for tenants whose RLS requires the column. **P0.**
- **`HROrgChart.tsx`** — verify tenant scoping on its query (previous pattern used raw supabase reads). **P1 to confirm.**
- **`useHRData.ts`** uses `supabase.from(...).order(...)` **without** `fetchAllRows`. Every list (employees, shifts, attendance, payroll, leave requests, leave ledger) is silently capped at the 1000-row PostgREST default. Payroll alone (46 employees × 12 months × multi-year) will hit this within a couple of years; shifts/attendance hit it much sooner. **P0.**
- **Payroll → Finance wiring:** `post_payroll_accrual` and `post_payroll_payment_batch` RPCs are called, but the UI never displays or links to the resulting `accrual_journal_entry_id` / batch `journal_entry_id`. No visible tie-back to Journal/Ledger — hard to audit. **P1 (UX-flavored logic gap).**
- **Leave balance math:** `hr_leave_balances.remaining_days` is stored, and `hr_leave_ledger` is separate. Need to confirm remaining = total − used is enforced by trigger; if not, the two can drift.
- **Payroll dedupe:** payroll list order and month filtering happens client-side after the capped fetch — combined with the `.limit` issue this may hide older records once volume grows.

---

## Prioritized Remediation Plan

### (A) Usability fixes to existing pages

| Page | Fix | Clicks before → after |
|---|---|---|
| `/hr/employees` | Row click opens **full profile page** `/hr/employees/:id` (not a dialog). Flatten the 4-dialog header into a single "Manage" popover; drop the tabbed Details/History dialog. | Profile: 4 → 1. Dept/holiday admin: 2 → 1. |
| `/hr/schedule` | Add **Today Board** as default view (`?view=today`); week grid becomes a tab. Add KPI strip (on-shift, hours planned/actual/variance, no-shows). Split `WeeklyScheduleView` (882 LOC). | "Who's working today": 2–3 → 0. |
| `/hr/leave` | Default landing = **Approvals queue + Leave calendar**; Balances/Types become tabs. Employee names click-through to profile. | Approve leave: 3 → 1. |
| `/hr/payroll` | Add KPI strip (gross, net, MPF, headcount, labor cost %). Replace the detail-modal with an inline expandable row or link to profile. Add "View journal entry" link per posted row. | Payroll GL check: page-hop → 1. |
| All pages | Migrate to `PageHeader`, `KpiGrid`, `StatusBadge`, `TableSkeleton`, `EmptyState`, `fmtHKWhole`, URL-persisted filters (venue, period). Add mobile card layouts on schedule + payroll. | — |

### (B) New pages / features (ranked by value ÷ effort)

1. **`/hr` People Dashboard** — headcount, labor-cost %, pending approvals, expiries. **High value, medium effort.**
2. **`/hr/employees/:id` Employee Profile** — pay, leave, docs, history on one page. **High value, medium effort.**
3. **Leave calendar view** on `/hr/leave`. **High value, low effort.**
4. **Roster vs Actual variance** widget on schedule + dashboard. **High value, low-medium effort** (data exists on `hr_shifts`).
5. **Document expiry tracker** (add `hr_employee_documents` or reuse `hr_employees` fields; expiry list on dashboard). **Medium value, low-medium effort.**
6. **Onboarding/offboarding checklists** (single `hr_checklists` + `hr_checklist_items` table). **Medium value, low effort.**
7. **Retire or repurpose `/hr/org-chart`** — either turn nodes into profile links or drop from sidebar. **Low value, trivial effort.**

### (C) Data / logic fixes

1. **P0** — Add tenant scoping to `usePayrollPaymentBatches.ts` (both reads and insert), mirroring the finance-pass pattern.
2. **P0** — Convert every list read in `useHRData.ts` to `fetchAllRows` (employees, shifts, attendance, payroll, leave requests, leave ledger, holidays, leave balances, departments, leave types).
3. **P1** — Audit `HROrgChart.tsx` for tenant scoping; add if missing.
4. **P1** — Surface `accrual_journal_entry_id` and payment-batch `journal_entry_id` in the payroll UI with click-through to `/finance/journal`.
5. **P1** — Verify leave-balance trigger keeps `remaining_days = total − used` in sync; add trigger if missing.
6. **P2** — Add a DB view `v_labor_cost_by_venue_month` joining `hr_payroll` (accrued) to `sales_records` totals to power the labor-cost-% KPI.

---

Approve this plan and I'll execute in phases: **C1–C3 (data safety) → A (usability retrofit of existing pages) → B1–B4 (new dashboard, profile, leave calendar, variance) → B5–B7**. Profit & Loss page remains untouched throughout.