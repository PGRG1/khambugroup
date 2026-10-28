# Roadmap: AI-native finance team + Bani

- [x] Auto-synthesize finance team review on Launchpad load (no "Get today's update" click)
- [x] Morning scheduled review via pg_cron → finance-team edge function (enabled daily 7 AM HK)
- [x] Bani chat action cards (mark closed days, open scanners) with server-side confirm
- [x] Proactive briefing: Bani briefs on first open each day, grounded by get_missing_sales_days

Deferred (discussed, not built): labor-vs-revenue (SPLH) insights, real-time COGS tracking, auto-saved operational memory notes.

## How you buy
- [x] Used app_config purchasing_mode because platform ClientDetail already uses cost_reporting_mode; KHAMBU set centrally, existing combined value untouched.
- [x] Only Purchasing Overview uses whole-group purchasing and revenue for central buying, with a light note; other pages and permissions unchanged.
- [x] Five rule tests passed; signed-in settings save/readback and 1280px/375px Overview checked, selecting Assembly leaves central spend unchanged; build OK.

## Purchasing Overview redesign
- [x] Applied dashboard-only header/KPI/list/table/legend styling, default September with October fallback pill, eight-month spend-only chart and bottom analysis links; signed-in 1280px/375px checks passed without page overflow or runtime errors, 35 tests passed, build OK.
- [x] Replaced Overview with four KPIs, paired pace charts, spend/revenue chart, ranked suppliers/categories, Items table and Worth checking.
- [x] Added centred supplier/item dialogs, calendar-month comparisons, search/sort and sticky item header; same-unit pricing and deposit exclusion tested.
- [x] Signed-in 1280px/375px Overview, All time/September/October/Custom, dialogs and central venue selection verified; 31 related tests passed, build OK. Non-admin visibility covered by existing access tests, not live preview switching.

## Purchasing navigation
- [x] Reorganise Purchasing, Stock & menu, Settings and collapsed rail without changing routes or permissions.
- [x] Add shared access-aware URL tabs and admin-only Overview analysis links.
- [x] Verify live navigation at 1280px/375px and rail highlighting; 20 route/access tests pass, including previewed admin/non-admin rules (preview switching not exercised live).
- [x] Follow-up: direct section links below Revenue, desktop contextual children, mobile section bars, and correct Spend Summary/Supplier Pricing visibility.
- [x] Updated navigation tests: 16 passed in isolated node environment (default runner blocked by missing canvas binding); signed-in 1280px/375px section navigation and rail order verified without page errors. Previewed access covered by tests, not live switching.

## Purchasing budgets
- [ ] Correct budget amount markers and rank every category by spend, including unbudgeted categories; verify 1280px/375px without changing saved data.
- [x] Restored full-page budget status/KPI/category layout without pace; Update budgets prefill verified against October suggestions without saving; 33 utility tests pass; signed-in 1280px/375px page/dialog checks fit, and September's saved 105,000 budget chart is horizontal throughout the month. No saved data changed.
- [x] Simplified budget box/category wording and mobile tables; dialog-picked full-month daily Sales forecast; atomic SECURITY INVOKER saves (0010); 44 rule tests passed, real save/readback and rollback verified, 1280px/375px page and pop-ups fit; September no-budget layout retained except requested label/scope changes. Temporary test budgets/history removed. Per-venue button restriction checked in code, not a live by-venue tenant.
- [x] purchasing_budgets + append-only purchasing_budget_changes (tenant RLS: members read, admins write), migration 0009 applied.
- [x] Pure budget math in purchasingOverview.ts (budgetByDay steps on change day; suggestions scaled by actual/expected sales, rounded to 100); usual pace removed as misleading (venues pre-order for next month) — status line is now 'left of/over budget · N days to go', amber only when over; 40 tests pass, verified at 1280px/375px.
- [x] Overview UI: admin Budgets button, status line, KPI progress, sales-vs-forecast note, stepped budget line in pace chart, Categories against budget, full edit/history dialog.
- [x] Verified signed-in at 1280px/375px: September without budgets unchanged, with budgets all elements render, no horizontal scroll; test rows removed after check. Sales note path untested live (September has no revenue target).
- [x] Visual pass: four KPI boxes equal height at 1280px/375px, petrol #2F5E5A bars on solid #E3E9E5 tracks (amber when over), whole-number budget percentages, category rows split spent / muted "of budget" / bold percentage; no horizontal scroll, build OK, 33 budget tests pass.
- [x] Added a plain "today" tick (not pace) to the Spend and category budget bars: 2px dark line at 55% opacity straddling each bar, share-of-month-gone position, key line under the category card title; September checked at 1280px/375px (tick at month end, row heights unchanged), current-month branch checked with the browser clock inside September, build OK.
