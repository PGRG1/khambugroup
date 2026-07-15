## Staff Reimbursements — new standalone module

Self-contained feature. Does NOT touch `petty_cash_receipts`, `petty_cash_floats`, or `usePettyCash`. Reuses `petty_cash_classifications` read-only for category mapping.

### 1. Database migration

**New table `staff_reimbursements`:**
- `id uuid pk`, `tenant_id uuid not null`, `venue_id uuid null`
- `claimant_name text not null`, `description text not null`
- `category_id uuid not null` — FK → `petty_cash_classifications(id)` (read-only reuse)
- `amount numeric not null check (amount > 0)`
- `claim_date date not null`
- `receipt_url text null`, `receipt_path text null`
- `status text not null default 'owing'` (allowed: `owing`, `paid`)
- `paid_date date null`
- `paid_from text null` (allowed: `bank`, `petty_cash`, `payroll`)
- `paid_from_bank_account_id uuid null` — FK → `bank_accounts(id)`
- `paid_from_float_id uuid null` — FK → `petty_cash_floats(id)` (read-only reference; no writes to that table)
- `journal_entry_id uuid null` — claim posting
- `payment_journal_entry_id uuid null` — payment posting
- `created_by uuid null`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`
- Trigger to maintain `updated_at`
- GRANTs for `authenticated` (CRUD) and `service_role` (ALL)
- RLS: tenant-scoped read/write via `tenant_id = get_active_tenant_id()` (matching pattern used by other tenant tables in the project)

**COA seed helper:** ensure a `Staff Reimbursements Payable` liability account exists per tenant on first use. Handled inside the hook (idempotent lookup-then-insert) rather than a one-off migration, so it works for every tenant automatically.

### 2. Hook — `src/hooks/useStaffReimbursements.ts`

Mirrors `usePettyCash.ts` shape:
- Loads: reimbursements, classifications (from `petty_cash_classifications`), COA (id/code/name/type), bank accounts (id/name/linked_gl_account_id), petty cash floats (id/name/gl_account_id) — all read-only except the reimbursements table itself.
- `totalOwing` — sum of `amount` where status = `owing`.
- `paidThisMonth` — sum of `amount` where status = `paid` and `paid_date` in current month.
- `ensureReimbursementsPayableAccount(tenantId)` — finds existing `Staff Reimbursements Payable` in `chart_of_accounts` for tenant, else inserts one (`account_type: liability`, `normal_side: credit`, code auto-picked as first free `21xx`, e.g. `2150`).
- `createClaim({ claimant_name, description, category_id, amount, claim_date, venue_id?, receipt_url? })`
  1. Insert `staff_reimbursements` row with status `owing`.
  2. Resolve category → `gl_account_id` (from `petty_cash_classifications`). If missing, throw a clear error.
  3. Resolve Staff Reimbursements Payable via `ensureReimbursementsPayableAccount`.
  4. Insert `journal_entries` row: `source_type = 'staff_reimbursement'`, `source_id = claim.id`, `entry_date = claim_date`, `status = 'posted'`, memo `Staff reimbursement — <claimant> — <description>`.
  5. Insert two balanced `journal_lines`:
     - Dr category GL account, amount
     - Cr Staff Reimbursements Payable, amount
  6. Update claim with `journal_entry_id`.
- `markAsPaid(claim, { paid_from, paid_date, bank_account_id?, float_id? })`
  1. Resolve credit-side GL:
     - `bank` → `bank_accounts.linked_gl_account_id`
     - `petty_cash` → `petty_cash_floats.gl_account_id` (read-only lookup)
     - `payroll` → for v1, throw "not yet supported" (payroll integration deferred)
     - Any missing linkage throws a clear error.
  2. Insert `journal_entries` row: `source_type = 'staff_reimbursement_payment'`, `source_id = claim.id`, `entry_date = paid_date`.
  3. Insert lines:
     - Dr Staff Reimbursements Payable, amount
     - Cr resolved cash/bank GL, amount
  4. Update claim: `status = 'paid'`, `paid_date`, `paid_from`, `paid_from_bank_account_id`/`paid_from_float_id`, `payment_journal_entry_id`.
- `reload()`

Both posting flows insert entries + lines and update the claim within the same async sequence (matching current `usePettyCash` pattern — no RPC, no transaction wrapper introduced).

### 3. Page — `src/pages/finance/StaffReimbursements.tsx`

Uses existing design primitives (`PageHeader`, `KpiCard`/`KpiGrid`, `StatusBadge`, `@/utils/format`) and matches the visual language of Payables/Receivables.

- **Header:** title "Staff Reimbursements", eyebrow "Finance", `+ Add Claim` action.
- **KPI strip (2 cards):** Total Owing, Paid This Month.
- **Filters:** status chips (All / Owing / Paid), simple search by claimant/description.
- **Table:** Claimant · Description · Category · Amount · Date · Status · Paid From · row action (`Mark as Paid` when owing, else view-only).
- **Add Claim dialog:** claimant (text), description (text), category (select from classifications), amount, claim date, optional receipt upload (reuse the existing receipt upload storage bucket used by petty cash — same path convention under `staff-reimbursements/<tenant>/…`).
- **Mark as Paid dialog:** paid-from radio (Bank / Petty Cash Float; Payroll disabled with "coming soon" hint), dependent selector, paid date. On confirm → `markAsPaid`.
- Loading skeleton and empty state consistent with Payables page.

No approval workflow, no submission portal.

### 4. Routing + sidebar

- `src/App.tsx` — add route `/finance/staff-reimbursements` → `StaffReimbursements`.
- `src/components/AppSidebar.tsx` — add `{ title: "Staff Reimbursements", url: "/finance/staff-reimbursements" }` to `financeItems` immediately after Accounts Receivable.

### 5. Explicit non-goals / assumptions
- Reversing a paid claim, editing after posting, and payroll payout are out of scope for v1 (matches "keep it simple" instruction).
- Receipt upload uses the existing storage bucket already used by petty cash receipts (assumption — will verify the bucket name during implementation and, if none is suitable, fall back to storing just the URL text without upload).
- `venue_id` is captured on the claim for reporting but not required in the UI (optional select in Add Claim dialog).
- Journal entries are posted immediately (status `posted`), consistent with how `usePettyCash` posts today.

### 6. Verification
- `tsgo` typecheck after edits.
- Manual sanity: create a claim → confirm two rows exist in the ledger (Dr expense / Cr payable); mark paid via bank → confirm payment journal (Dr payable / Cr bank).
