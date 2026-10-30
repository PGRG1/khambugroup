## Invoice phone layout correction
- [ ] Correct mobile Purchasing menu, title action, single tab strip and toolbar
- [ ] Correct centred mobile details and verify screenshots at 375px/1280px

## Scanner matcher Part B
- [x] Finish decision cards and remove obsolete suggestion controls without changing financial workflow
- [x] Verify approved-document scan and human feedback without saving; desktop/mobile and real 2/10-line timings (10.4s / 18.0s)
- [x] Run 46 focused regressions; preview checks passed

## Invoices matched to Sales records
- [x] Reuse page top/period, kit toolbar/table and below-header underline purchasing tabs
- [x] Centre invoice details with compact factual review, attachments and preserved actions
- [x] Verify real October invoice (HK$616) alongside Sales records at 1280px/375px; all four tabs, selection and More menu checked; 46 focused tests passed

## Invoices layout and Documents navigation
- [x] A: Invoices layout, period picker, summary, selection and attachment downloads; preserve all operational handlers
- [x] B: Remove Documents page/tab and redirect old URL without deleting stored data
- [x] Verify September 2026 at 1280px/375px, detail/empty states, selected attachment download and Documents redirect; 46 focused tests passed using isolated Node setup (default suite blocked by existing canvas dependency)

## Active scanner matcher recovery
- [x] A: reconcile and test existing-master fallback and new-item drafts
- [x] B: invoice-wide scanner matching and decision cards, preserving financial workflow
- [x] C: recover migration record and integrate tenant-scoped human feedback
- [x] Verify approved-document scan without saving, desktop/mobile, and timing (16.6s / 34.4s)
- [x] Verify human feedback write/read end-to-end: manual picker linked Jim Beam and saved its original sure prediction and chosen item to match_feedback; no invoice saved

# Roadmap

## Invoice review display clean-up
- [x] Compact summary, folded details/status, simple/full lines and optional notes; no operational changes
- [x] 55 focused tests; 1280/375 browser checks using unsaved two-line rounding fixture (real HK$1,020 source example unavailable)

## Isolated invoice matcher
- [ ] Separate tenant-checked matcher, pre-date evidence and deterministic hard checks
- [ ] Admin-only backtest results storage and 50-invoice random KHAMBU run
- [ ] Tests, access validation, results/cost report and created-file inventory

## Receipt safety and contextual Bani
- [x] Explicit save outcomes, upload failures and journal outcome propagation
- [x] Non-posting, idempotent receipt exceptions with scoped source and comparison UI
- [x] Contextual chat, anti-introduction and honest supported action outcomes
- [x] 50 focused tests; document scope in RECEIPT_SAFETY_SCOPE.md
- [ ] Independently source-verified autonomous posting: not implemented; all scans safely flagged pending verifier/session/period evidence
- [ ] Complete signed-in scanner/comparison browser verification: blocked by unstable loading transitions; no live financial writes permitted

## Sales receipt evidence memory — Step 1
- [x] Audit scan/save, schema and access paths
- [x] Add immutable extraction and saved correction evidence, scoped retrieval
- [x] Integrate non-blocking capture without changing UI or financial saves
- [x] Run 28 focused tests; validate schema/deployment and signed-in retrieval/access rejection (no production financial writes)

## Purchasing foundation — build 1 (done; browser check pending)
- [x] Migration: invoices.held_amount, tenant_members.purchasing_role (+backfills), unique GRN-per-invoice index
- [x] Invoice statuses: Draft/To approve badges + filters; scanner onSave mapping fix (under_review→Draft)
- [x] Exclude Draft from Purchasing Overview + usePayables; held maths in usePayables
- [x] Open Payables + SupplierAccount: Held column, "Held in disputes" KPI
- [x] Purchasing role select in User Access (admins only)
- [x] Remove door-tap pop-up + New delivery buttons; "Report a problem" on invoice detail + GRN detail
- [x] DeliveryCheckDialog: problem-only, affected qty for all issues, held_amount update
- [x] Purchase Orders always in nav; remove delivery-check radios (MasterData, onboarding)
- [x] received_date = invoice date (HK) for auto-GRN + problem reports
- [x] Tests: statuses, held maths, role backfill mapping, problem quantities, nav rule
- [x] Browser check: Invoices, Open Payables, Goods Receipts, User Access, Purchasing Overview @1280/375

## Bani doing the work, live
- [x] Live step labels in Floating Bani chat (replaces dots)
- [x] Scanner: live steps, "Recorded" card on auto-save, auto-close, Bani draft cleared
- [x] Sales table refreshes live (realtime + tab focus)
- [x] Bani can propose a day note on receipt drafts; no more "press Save" prompts
- [x] Sidebar: People before Expenses; Activity Log only under Settings
