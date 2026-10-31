## People — Part 2
- [x] Settings-aware weekly/day rota, dated hours/cost/sales checks, confirmed edit/copy/cover/ask and sent status
- [x] Identity-bound phone clock-in/out and 150 m venue check; location fields in venue People settings; daily manager confirmation; grid/profile leave and swap decisions
- [x] 36 focused rules/People/navigation tests and build OK; signed-in desktop/375px page checks without overflow, temporary 11–19 shift with 30-minute break saved/read back/removed; live Bani copy proposal verified. Payroll unchanged.
- [ ] Real staff clock-in/out, physical 150 m enforcement and manager confirmation: no employee has a linked login and venues have no saved coordinates; account/location setup is required. Live leave balance approval, swap concurrency and separate non-admin manager access remain unverified; no test balances or permission changes were made.

## People — Part 1
- [x] Team/Rota & hours/Payroll navigation and requested redirects; Company/active venue People settings
- [x] Clean Team table, shared scope/filter/search/download, Bani venue/new-person/change drafts and explicit owner-review requests
- [x] Centred profiles, private versioned documents/contract review, 60-day expiry notices, dated history and annual-leave presentation
- [x] Dated unsaved payroll calculation and save-roundtrip preservation; existing saved payroll authoritative; no Rota/Payroll redesign
- [x] 17 focused tests via Node setup (default canvas dependency unavailable), build OK, signed-in phone/desktop Team/profile/settings/draft checks without overflow. Confirm created pending request, no employee, non-owner approval rejected; temporary request removed.
- [ ] Owner/Strict approval and actual private contract/version upload: unavailable in current non-owner session; no unauthorized privilege grant made. Real contract extraction, cross-venue manager file access, phone-at-venue enforcement and staff-app/payslip experiences remain unverified/unbuilt pending later People parts.

## Supplier Accounts — Part 2
- [x] Restyle detail header, nonzero summary, More actions/Deals and five clean-table tabs; preserve existing tab actions, default Open invoices
- [x] Received Asset-line container grouping, deposits summary and centred confirmation dialog; standalone idempotent negative GRN return under existing user RLS, no invoice/PO/payment writes
- [x] 69 tests and build OK. Signed-in 1280/375 checks on all tabs/Deals; tab bar scrolls independently, page has no sideways overflow. Real Telford 5 containers loaded. Temporary test confirmed -1 against paid 4 at HK$50, UI read returned 1/out 3/held HK$150; nothing before Confirm; test records removed. List, Finance, Stock and Menu costs unchanged.
- [ ] Separate non-admin return permissions, concurrent confirmation and unrelated container aliases: not exercised; existing RLS and request idempotency retained, brand/size variants are not guessed together.

## Supplier Accounts — Part 1
- [x] Remove Purchasing sub-tabs and redirect legacy buying-side payables/deposits; Finance Payables unchanged
- [x] Supplier/invoice list, due-date ageing switches, scoped totals and filtered whole-dollar downloads
- [x] Approval-only oldest-invoice matching and median due-date suggestions using user-RLS atomic RPCs; matching keeps existing dispute/post-payment exclusions, median half-days round upward
- [x] 64 tests and build OK; signed-in 1280/375 list/dialog/redirect checks, no overflow. Temporary supplier: HK$40 matched to HK$100 invoice, list read HK$60; unknown terms entered as 30 and due date read 31 Oct 2026; no writes before Approve; temporary supplier/invoice/payment removed. Supplier details, Finance, Stock and Menu costs untouched.
- [ ] Separate non-admin approval/Preview As session and concurrent double-approval stress: not exercised; server RLS, locked balance rechecks and disabled preview approval remain in place.

## Menu costs — Part 3
- [x] Food cost period table, approved-count basis and sales-day coverage through today
- [x] Recipes table, latest confirmed received ingredient costs, inline recipe/price editing
- [x] Tenant-validated menu drafting and selectable draft saving; unknown ingredients remain unpriced
- [x] 47 frontend + 4 function policy tests; build OK. Signed-in 1280/375 checks: real food figures, recipes, centred details and no overflow. Sample photo drafted four bought ingredients, saved a recipe, read it back and deleted it; original 3 dishes/10 ingredients/7 prices remain. Stock pages unchanged.
- [ ] Real multi-page menu PDF accuracy and counts-based live figures: require a real menu and approved opening/closing count pair; pure count math tested. Separate non-admin permission session not exercised.

## Stock counting — Part 2
- [x] Phone-first area count: photos, browser dictation/text, typed items and corrections
- [x] Tenant-validated read-stock-count using the matcher model and recent delivered-item context
- [x] Deterministic expected quantities, gap-only sending and manager/owner whole-count approval
- [x] 33 frontend + 3 edge tests and build OK. Signed-in 375/1280 checks: model read/save of delivered Jim Beam, correction 2→3, three areas completed, pending review, whole-count approval, On hand 3 Bot, approved edit rejected. Temporary count deleted; original June draft untouched. Menu costs unchanged.
- [ ] Physical shelf-photo accuracy and actual phone speech capture: require user device/real shelf photos; upload/camera controls and speech text fallback implemented but physical inputs unverified. Separate non-admin manager/owner session not exercised; existing admin/manager write restrictions preserved, Counts discoverable with invoice access.

## Stock simplification — Part 1
- [x] Two-page navigation, underline Stock tabs and legacy movement redirects
- [x] Count-aware On hand list and centred item/count dialogs, deposits unchanged
- [x] Merged Movements with existing waste/consumption/transfer workflows
- [x] 33 tests and build OK; signed-in 1280/375 checks, item/count/staff/transfer dialogs and CSV BOM; no overflow or data writes. KHAMBU has no counts or movements to verify populated detail workflows without creating data.

## Purchase Register redesign
- [x] Match Invoices layout, reuse scanner/detail workflow, scope by invoice venue and preserve realtime/export/attachments
- [x] Add 50-line pagination, optional columns and By item summaries/dialog with previous-90-day median and free-unit math
- [x] 30 focused tests and build OK. Signed-in 1280px/375px checks: September 427 lines/HK$96,912/12 suppliers; Hoegaarden 6 kegs/HK$4,302/717.00 overall, two free units. Venue picker reduced Caliente to 288 lines/HK$53,865; CSV BOM, pagination, optional column, scanner and loaded attachments verified without uploading/saving.

## Purchasing phone navigation consistency
- [x] Reuse Revenue section pills for Purchasing; keep active pills and underline tabs visible
- [x] Signed-in 375px screenshots and computed styles match; Invoices starts active, last pill scrolls into view, no overflow, desktop row hidden. 21 navigation regressions passed with isolated Node setup (default canvas setup remains broken); build OK.

## Invoice phone layout correction
- [x] Correct mobile Purchasing menu, title action, single tab strip and toolbar
- [x] Verify real October record at 375px/1280px: screenshots, centred details, aligned controls and no horizontal overflow; 37 regression tests passed

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
