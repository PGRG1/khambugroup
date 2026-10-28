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
