
# Venue Cost Allocation — Management-Accounting Overlay

## Guiding principle

One real transaction = one real posting. The allocation is a **read-side slicing layer** used only by venue-level reports (venue P&L, PayrollTab subtotals, labor-cost-%, venue spend). Journals, TB, BS, entity P&L, payroll accrual, and bill posting are **not touched**.

## 1. Data model

### 1.1 Reusable profile (recommended — supports both named profile AND inline custom)

```
venue_allocation_profiles
  id uuid pk
  tenant_id uuid  (RLS)
  name text            -- e.g. "Shared FOH — 40/30/20/10", "Even split", "By seats"
  method text          -- 'manual_percent' | 'even' | 'by_seats' | 'by_headcount' | 'by_revenue'
  is_active bool
  is_default bool      -- one default per tenant (used as fallback)
  notes text
  created_at / updated_at
  UNIQUE (tenant_id, name)

venue_allocation_profile_lines
  id uuid pk
  tenant_id uuid
  profile_id uuid fk -> venue_allocation_profiles on delete cascade
  venue_id uuid fk -> venues
  percent numeric(7,4)   -- 0..100, only meaningful when method='manual_percent'
  UNIQUE (profile_id, venue_id)
  CHECK sum(percent)=100 enforced by trigger for method='manual_percent'
```

For `method` values other than `manual_percent`, weights are derived at read time (even = 1/N over active venues; by_seats reads `venues.seats`; by_headcount from `hr_employees` home venue counts; by_revenue from `v_pl` revenue for the period). This lets one profile stay correct as the business changes without editing lines each month.

**Custom inline splits**: supported by allowing a record (employee row or bill) to point to `profile_id = NULL` **and** carry its own `venue_allocation_overrides` rows (same shape as profile_lines but keyed on the owning record). The read view picks override rows first, else the profile, else 100% to the record's home venue (safe fallback = no change vs today).

```
venue_allocation_overrides
  id uuid pk
  tenant_id uuid
  owner_type text      -- 'employee' | 'expense_bill'
  owner_id uuid
  venue_id uuid
  percent numeric(7,4)
  UNIQUE (owner_type, owner_id, venue_id)
```

### 1.2 Employees

Add to `hr_employees`:
- `cost_allocation_profile_id uuid null` — optional named profile.
- `cost_allocation_mode text default 'home_venue'` — `'home_venue' | 'profile' | 'custom'`.

Keep `venue_id` as the primary/home venue (HR directory, scheduling, payroll grouping today). Cost splitting is orthogonal and only read by reporting queries.

Payroll rows (`hr_payroll`) need no schema change — the split is derived from the employee's mode/profile/overrides at report time, keyed on the payroll `year/month`.

### 1.3 Expense bills

Add to `expense_bills`:
- `cost_allocation_profile_id uuid null`
- `cost_allocation_mode text default 'manual'` — `'manual' | 'profile' | 'custom'`

Keep `expense_bill_allocations` exactly as-is (it stores category/account line items for the GL). Two options for the venue split, pick **A**:

- **A (recommended, no schema churn):** venue split is a **separate** overlay computed at read time from the profile/overrides against the bill's `total_amount`. `expense_bill_allocations.venue` remains a manual per-line optional tag, unchanged. Journal posting is unchanged.
- B: auto-populate `expense_bill_allocations.venue` per line from the profile. Rejected — mixes GL data with a management overlay and complicates reversal.

UI: in the Bill editor, a "Venue cost split" section shows the effective split (profile or custom) alongside GL allocations; no impact on posting.

## 2. Effective-split read layer (single source of truth)

New DB view — **the** canonical resolver used everywhere:

```
v_venue_cost_allocation(owner_type, owner_id, tenant_id, venue_id, percent)
```

Resolution order per (owner_type, owner_id):
1. `venue_allocation_overrides` rows if any → use directly.
2. else if `cost_allocation_mode='profile'` and profile set → expand profile (manual_percent from lines; even/by_seats/by_headcount/by_revenue computed).
3. else 100% to the owner's home venue (`hr_employees.venue_id` / `expense_bills.venue_id`), falling back to 'Unassigned' when null.

Percentages guaranteed to sum to 100 per owner. This guarantees venue splits sum back to entity totals — **no double counting, no leakage**.

## 3. Reporting touch-points

### Must change (DB view layer)

- **`v_labor_cost_by_venue_month`** — rewrite to join `hr_payroll` × `v_venue_cost_allocation(owner_type='employee')` and multiply `(gross + mpf_employer) * percent/100` before grouping by venue. Revenue side unchanged. Fixes labor-cost-% correctness at the source so every consumer benefits.
- **New `v_venue_expense_month`** — `expense_bills` (posted only) × `v_venue_cost_allocation(owner_type='expense_bill')` × `total_amount * percent/100`, grouped by tenant/venue/year/month/category. Used by venue P&L and Spend Summary venue breakdowns.
- **New `v_pl_by_venue`** (optional but recommended) — union of: revenue from `v_pl` (already venue-tagged via journal_lines.venue), labor from the new labor view, expenses from the new expense view, other GL lines fall through with their existing venue tag or 'Unassigned'. Entity totals equal `v_pl` totals by construction.

### Consumers that automatically become correct once views change

- `PayrollLaborCostCard` (already reads `v_labor_cost_by_venue_month`).
- `HRDashboard` labor block (same view).
- Any future Venue P&L page.

### Must change (component-level)

- **`PayrollTab` venue subtotals** — today groups a whole payroll row under `venue_id`. Change to: for each payroll row, expand via allocation and add fractional amounts into per-venue subtotals. Cluster header still shows the employee's home venue for readability; a small "split" chip appears next to shared employees. Grand total unchanged. Payroll save/post RPCs untouched.
- **`SpendSummary.tsx`** venue breakdown — switch its per-venue aggregation from `expense_bill_allocations.venue` free-text to the new `v_venue_expense_month` view (or resolver util) so utility bills split correctly. Category totals unchanged in aggregate.
- **`Approvals.tsx`** — no math change; optionally show the effective split preview in the readiness panel.

### Stays presentation-only (no DB work)

- Bill editor "Venue split preview" panel.
- Employee editor "Cost allocation" panel (profile picker + custom overrides editor).
- New tenant-scoped **Profiles admin page** under Admin → Master Data ("Venue allocation profiles").

## 4. Explicitly UNTOUCHED

- `post_payroll_accrual`, payroll settlement, `hr_payroll_payment_batches` — no change.
- `reverse_and_regenerate_sales_journal`, `post_expense_bill`, `reverse_expense_bill` — no change.
- `journal_entries` / `journal_lines` — no change (still one line per real posting).
- `v_pl` (entity), Trial Balance, Balance Sheet, entity P&L page — no change.
- `expense_bill_allocations` structure and GL semantics — no change.

## 5. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Splits don't sum to 100 | Trigger on `venue_allocation_profile_lines` and `venue_allocation_overrides` enforces sum=100 for manual_percent; derived methods normalize in the view. |
| Double counting | All venue reports read the resolver view; entity totals always equal `SUM(percent)=100 × amount`. Add a Vitest for `SUM(venue_amount) = payroll_row_amount` and `= bill_total`. |
| Legacy free-text `venue` on old expense_bill_allocations lines | Ignored by the new view; kept for backward reads only. Migration note, no data change. |
| Derived methods (by_revenue/by_headcount) with zero denominators | Fallback to even split, flagged in view with a `basis` column so UI can warn. |
| Historical months change when profile edited | Profiles are effective-dated (`effective_from`, `effective_to`) OR snapshotted onto payroll month at post time. Recommend effective-dated columns on `venue_allocation_profile_lines` to keep past months stable; add in same migration. |

## 6. Rollout order (build phase, once approved)

1. Migration: profiles + lines + overrides + employee/bill columns + effective dating + sum triggers + GRANTs + RLS.
2. Migration: `v_venue_cost_allocation` + rewrite `v_labor_cost_by_venue_month` + new `v_venue_expense_month` (+ optional `v_pl_by_venue`).
3. Admin UI: Profiles CRUD page.
4. Employee editor + Bill editor: profile picker + custom overrides + effective-split preview.
5. `PayrollTab` subtotal expansion + shared-employee chip.
6. `SpendSummary` venue breakdown switch to new view.
7. Reconciliation test: for every tenant/month, sum of venue slices == entity total (payroll and expenses).

## 7. Open questions for you

1. Effective-dating on profile lines (my recommendation) vs snapshot-at-post — pick one so historical months don't drift.
2. Should `by_revenue` use trailing-3-month revenue or same-month revenue? Same-month is simpler; trailing avoids circularity with labor-cost-%.
3. For utility bills spanning a service period crossing months, split by the profile of the bill_date only, or prorate across months? (Current bills don't prorate across months anywhere else, so I'd keep bill_date only.)
