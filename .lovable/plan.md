
# Expenses Section — Senior Audit (read-only)

Reviewed: `src/pages/expenses/*` (10 pages), `src/pages/finance/BillsExpenses.tsx`, `src/components/expenses/shared.tsx`, `src/hooks/useExpenseBills.ts`, `src/hooks/useVendorStatements.ts`, `src/hooks/useRecurringExpenses.ts`, sidebar order in `src/components/AppSidebar.tsx`, RLS on `expense_*` + `suppliers`.

## 1. Workflow Integrity

### BROKEN (data-integrity / silent-fail class)
1. **Duplicate Bill entry surfaces** — `BillsExpenses` lives at `/finance/bills-expenses` AND `ExpenseBills.tsx` (2-line stub) is mounted at `/expenses/bills`. Overview "New Expense"/"Upload Bill" links to `/expenses/bills`. Two doors, one workflow — the sidebar order (Master Data → Bills & Vendors → Approvals) is broken because the real editor lives under Finance. `src/App.tsx:200,275`, `src/pages/expenses/ExpenseBills.tsx`.
2. **Free-text `expense_category` still allowed on allocations** — `BillsExpenses.tsx:584` exposes "Other (typed)" and free-text `Input`; `useExpenseBills.saveBill` (line 163) writes raw string; DB column has no FK to `expense_categories`. So orphan categories can still enter the ledger — the master-data promise is soft. Also `Approvals.tsx` "Edit & Approve" quick editor (line 64) creates an allocation with `expense_category: null, account_id: null` then posts, which will fail silently or bypass mapping.
3. **`BankDetectedExpenses.postDirect` creates an orphan bill** with no allocation row, no `account_id`, no `expense_category`, no venue (`BankDetectedExpenses.tsx:82-97`) and marks it `approval_status:'posted'` without calling the `post_expense_bill` RPC. Result: `expense_bills` row exists but no `journal_entries`/`journal_lines` are written, `expense_bill_audit` isn't updated, and totals will not roll into P&L. This is the biggest silent-drop.
4. **`useRecurringExpenses.generateNow` posts auto-approved bills without any allocation mapping check** — `useRecurringExpenses.ts:159-190` calls `generate_recurring_expense_bills` RPC then loops `post_expense_bill` on rules where `auto_approve=true`. If the rule has no `account_id`, posting will error per-bill and the toast only reports the first failure; nothing tells the user which rules produced unmapped bills.
5. **Recurring rules can be created with no category and no debit account** — `RecurringExpenses.tsx` "Save" (line 102) has no validation; you can Activate a rule that will generate un-postable bills forever.
6. **Vendor Statement posting has no explicit approval-post path** — `VendorStatements.tsx` writes rows but there is no "Post statement to GL" button; `Approvals.tsx` lists them but only shows a read-only table (no approve/reject/post buttons for statements, lines 158-185). So `late_fees` / `current_period_charges` claimed to "post to P&L" (see labels on line 225,233) never actually post from anywhere in the UI.
7. **Overview KPIs conflate recognition vs posting** — `Overview.tsx:117` includes `approval_status='approved'` in "Actual MTD", but only `posted` writes to GL. Approved-but-unposted bills are counted as actuals, causing dashboard drift against P&L.
8. **Excel/CSV bulk upload for bills does not exist** — "Upload Bill" button on Overview just deep-links to `/expenses/bills` (stub route). No CSV path parallel to Daily Sales.

### ACCEPTABLE (working correctly)
- Server-side tenant filtering is now consistently applied on reads and mutations across all hooks and pages (RLS + `.eq("tenant_id", tenantId)` defence-in-depth verified).
- `expense_categories`, `expense_payment_terms`, `suppliers`, `expense_bill_allocations` RLS policies are tenant-scoped and admin/manager-gated where appropriate.
- Master-data prompt banners fire on Overview and BillsExpenses when categories/vendors are empty.
- `hasUnmappedAllocation` warning blocks the interactive Post button in `BillsExpenses.tsx:648`.
- Vendor `type` filter fixed (no more empty Vendors page).
- Venues, suppliers, categories dropdowns everywhere read from master tables — no hardcoded lists remaining (verified via grep).

## 2. Professional Polish

### UNPROFESSIONAL
9. **`Analytics.tsx` regressions** — hardcoded HK$ formatter (line 19), hardcoded chart palette (line 22) including non-semantic `#a78bfa/#f59e0b/#ef4444`, no KPI strip, no skeletons, no empty states, no filters at all (venue/period/vendor). It's a demo, not a finance analytics page.
10. **Approvals.tsx uses raw divs, no KPI strip, no filters, no skeleton, no scope line** — a bookkeeper cannot filter by vendor/venue/amount/date to triage. Statement approvals block has no action buttons at all.
11. **Overview KPI strip has 7 tiles in one row** — will wrap awkwardly; no `min-w-0`/truncation guards on very large HK$ values. No period selector; MTD is hardcoded to current month with no way to look back.
12. **`ExpensePaymentTerms.tsx` has no search, no scope line, no KPI strip** — inconsistent with the other master-data pages.
13. **`VendorStatements.tsx` has no search, no filters, no KPI strip** — no way to find a statement in a long list, no "posts to GL" action.
14. **`BankDetectedExpenses.tsx` lacks category assignment UI, venue assignment, account picker** — the "Post to expense" is a one-click orphan-maker (see #3). Should open the same allocation sheet as BillsExpenses.
15. **No mobile card fallback** on `BillsExpenses`, `VendorStatements`, `RecurringExpenses`, `Approvals`, `Overview` tables — they horizontally scroll on phone.
16. **Editor Sheets** in `BillsExpenses.tsx` (line 428) and `RecurringExpenses.tsx` (line 203) are dense grids without section separators, sticky footer actions, or keyboard shortcuts. `RecurringExpenses` Sheet is 400+ lines of unstructured form.
17. **"Save Draft/Submit/Approve/Reject/Post" actions in BillsExpenses editor are inline text buttons** without confirmation for Post/Reject, and don't disable while a save is in flight.
18. **No unified activity/audit view** at the section level — audit is only visible inside a bill editor.
19. **Section-level scope line missing** on `RecurringExpenses`, `VendorStatements` (just a bare count line).
20. **Sidebar order does not lead the user through the flow** — "Overview" then "Master Data" then "Bills & Vendors" is right, but the actual bill editor lives under `/finance/bills-expenses`, breaking the guided narrative.

### SPEED
21. **`useExpenseBills` refetches all bills after every save/status/payment/document change** (`refresh()` on every mutation) — for large tenants this becomes expensive. No React Query, no optimistic updates.
22. **`ExpenseVendors.tsx` pulls `expense_bills` in full to compute overdue KPIs client-side** (line 79) — should be a materialised view or `count` aggregate.
23. **`BankDetectedExpenses` pulls the full `bank_transactions` table and filters client-side** (`amount<0` OR regex) — should be a DB view or server-side filter with pagination.
24. **`Overview` fetches bills + statements + rules + bank txns simultaneously via three separate hooks** — no shared cache, each page re-fetches on mount.
25. **No pagination** on any expense table; all rely on `fetchAllRows` batching, fine for now but Bills will grow past 10k rows in a year.

## Overall Verdict

**Not at a professional standard yet.** The visual layer (PageHeader/KPI/skeleton/empty-state/tokens) landed well and tenant filtering is correct, but the *workflow* still allows silent orphans in three separate places (bank direct-post, quick approval editor, free-text categories) and the section has two competing bill-entry doors. A finance auditor would flag #3 and #6 as material — expenses being marked "posted" without journal entries is a reconciliation nightmare.

## Top 5 fixes to reach professional standard

1. **Kill the duplicate door.** Delete `/expenses/bills` stub; move `BillsExpenses.tsx` under `src/pages/expenses/Bills.tsx` and route `/expenses/bills` to it. All CTAs already point there.
2. **Make GL account non-optional on every posting path.** Remove `"Other (typed)"` from allocations, add FK `expense_bill_allocations.expense_category_id → expense_categories.id`, and reject `post_expense_bill` server-side when any allocation lacks `account_id`. Rewrite `BankDetectedExpenses.postDirect` to open the bill editor pre-filled instead of inserting a "posted" orphan.
3. **Wire statement posting.** Add "Approve & Post" (and Reject) actions to the Statements block in `Approvals.tsx`; implement a `post_vendor_statement` RPC that writes `current_period_charges + late_fees` to GL against the vendor's default account. Otherwise the "posts to P&L" labels are lies.
4. **Fix Overview KPI semantics.** "Actual MTD" = posted only; add "Approved (unposted)" as a distinct tile. Add a period selector (This month / Last month / Custom).
5. **Rebuild Analytics + Approvals as first-class pages** with the shared `PageHeader`/`KpiGrid`/skeletons/filters/scope-line, semantic chart tokens, venue+vendor+period filters, mobile card fallback, and disable-on-loading action buttons. While there, add the missing search+KPI to Vendor Statements, Payment Terms, and Recurring Expenses.

Ready to implement once you confirm; I'll start with #1–#3 (data integrity) then #4–#5 (polish).
