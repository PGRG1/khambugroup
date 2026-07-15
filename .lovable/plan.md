All three changes are already implemented in the codebase. Re-issuing the plan below for confirmation — approving it will just re-verify wiring, not rebuild.

## 1. Top-level sidebar section
- `src/components/AppSidebar.tsx` already registers a standalone `staff_reimbursements` nav group (own icon, own `showStaffReimb` permission flag, own `CollapsibleNavGroup`) with a single "Overview" item at `/staff-reimbursements`. Not nested under Finance.
- Route wired in `src/App.tsx` → `<StaffReimbursements />` under `AdminRoute`.

## 2. KPI strip breakdown by financial_type
- `src/pages/finance/StaffReimbursements.tsx` already computes `monthByFinancialType` (COGS / Opex / Asset / Other) from `petty_cash_classifications.financial_type`, using the current month across both owing + paid claims, and renders it alongside Total Owing / Paid This Month via `KpiCard`/`KpiGrid`.
- Category column in the main table renders a `StatusPill` combined with the financial-type tag.

## 3. AI file parser
- Edge function `supabase/functions/parse-staff-reimbursement/index.ts` accepts base64 files + mimeType, handles images/PDF natively, uses `xlsx` for Excel and `mammoth` for Word to extract text server-side, then calls Lovable AI Gateway (`google/gemini-2.5-flash`) with the tenant's category list and returns an array of `{claimant_name, description, amount, claim_date, suggested_category_id, confidence, source_hint}`.
- Review UI `src/components/staff-reimbursements/ReimbursementAiImport.tsx` is a two-step dialog: upload → editable rows (category dropdown pre-selected to AI guess, amount/date/description/claimant editable, per-row remove) → Save All routed through the existing `createClaim` in `useStaffReimbursements` so all journal-posting logic stays untouched.
- "AI Import" button sits next to "+ Add Claim" on the Staff Reimbursements page. Manual dialog unchanged.

## What implementation would do if re-approved
Nothing new — I'd just run a typecheck and confirm the three pieces above still compile and route correctly. If you want changes (e.g. move page out of `src/pages/finance/` into `src/pages/staff-reimbursements/`, tweak the KPI layout, add per-row Save, change AI model), tell me the diff you want and I'll revise the plan.