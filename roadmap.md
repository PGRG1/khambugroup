# Roadmap: AI-native finance team + Bani

- [x] Auto-synthesize finance team review on Launchpad load (no "Get today's update" click)
- [x] Morning scheduled review via pg_cron → finance-team edge function (enabled daily 7 AM HK)
- [x] Bani chat action cards (mark closed days, open scanners) with server-side confirm
- [x] Proactive briefing: Bani briefs on first open each day, grounded by get_missing_sales_days

Deferred (discussed, not built): labor-vs-revenue (SPLH) insights, real-time COGS tracking, auto-saved operational memory notes.

## Purchasing navigation
- [x] Reorganise Purchasing, Stock & menu, Settings and collapsed rail without changing routes or permissions.
- [x] Add shared access-aware URL tabs and admin-only Overview analysis links.
- [x] Verify live navigation at 1280px/375px and rail highlighting; 20 route/access tests pass, including previewed admin/non-admin rules (preview switching not exercised live).
- [x] Follow-up: direct section links below Revenue, desktop contextual children, mobile section bars, and correct Spend Summary/Supplier Pricing visibility.
- [x] Updated navigation tests: 16 passed in isolated node environment (default runner blocked by missing canvas binding); signed-in 1280px/375px section navigation and rail order verified without page errors. Previewed access covered by tests, not live switching.
