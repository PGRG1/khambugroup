## Goal

Enable installable PWA + Web Push so Khambu users get a once-daily "Business Pulse" notification on their phone home-screen app when self-defined KPIs (MTD revenue vs goal, MTD COGS, daily revenue, labour %, etc.) cross thresholds they configured themselves.

## 1. PWA installability (home-screen)

- Add `public/manifest.webmanifest` (name "Khambu", short name "Khambu", `display: standalone`, theme `#0F0F12`, background `#0F0F12`, icons 192/512 + maskable).
- Generate app icons into `public/icons/` (emerald "K" mark on near-black).
- Add manifest + apple-touch-icon + theme-color tags to `index.html` head.
- No app-shell service worker, no `vite-plugin-pwa` — manifest-only, per Lovable PWA skill.

## 2. Web Push service worker (separate from app-shell)

- Add `public/push-sw.js` — handles `push` and `notificationclick` events only. No caching, no fetch handler. Safe under the "messaging worker" carve-out.
- Register it only on the published app (skip in Lovable preview/iframe/dev), scoped to `/`.

## 3. VAPID keys + secrets

- Generate VAPID public/private keypair once via an edge function (`vapid-init`) run on demand by an admin; persist into Lovable secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:alerts@khambu`). Public key also exposed to client via a tiny `get-vapid-public-key` edge function (so we don't need to bake it in code).

## 4. Database (one migration)

Tables (all with proper GRANTs + RLS):

- `push_subscriptions` — `id`, `user_id`, `endpoint UNIQUE`, `p256dh`, `auth`, `user_agent`, `created_at`, `last_seen_at`. RLS: user can CRUD their own rows; admin can read all.
- `alert_rules` — user-defined thresholds:
  - `id`, `user_id` (owner; null = global rule, admin only)
  - `name` (e.g. "MTD Revenue below goal")
  - `metric` enum: `mtd_revenue`, `mtd_cogs`, `mtd_cogs_ratio`, `mtd_labour_ratio`, `today_revenue`, `today_covers`, `mtd_revenue_vs_goal_pct`
  - `venue` (nullable = group-wide)
  - `operator` enum: `lt`, `lte`, `gt`, `gte`
  - `threshold` numeric
  - `severity` enum: `info`, `warning`, `critical`
  - `audience_roles` text[] (default `{admin,manager}`) — which roles receive it
  - `enabled` bool, timestamps
- `alert_events` — fired alerts (for dedupe + history): `id`, `rule_id`, `fired_for_date`, `metric_value`, `goal_value`, `payload jsonb`, `sent_count`, `created_at`. Unique `(rule_id, fired_for_date)` so the daily job doesn't double-fire.

## 5. Daily evaluator edge function (`evaluate-alerts`)

- Runs at 21:00 HKT daily via pg_cron + pg_net (scheduled by `supabase--insert`, not migration, since it carries project URL + anon key).
- Computes today's metric values from `sales_records`, `invoices`, `hr_payroll`, and active `revenue_targets` / `forecasts` (for the "vs goal" metrics).
- For each enabled `alert_rule`: evaluate `operator threshold`, skip if already fired today (`alert_events` unique), otherwise insert event and call `send-push` for every `push_subscriptions` row whose owning user has a matching role in `user_roles` ∩ `audience_roles` and permission on the venue.
- Also fires one always-on "Daily Business Pulse" notification per user (compact summary: Revenue, COGS, vs goal) regardless of thresholds — toggle per user in settings.

## 6. Push sender edge function (`send-push`)

- Uses `npm:web-push` with VAPID secrets.
- Body: `{ subscription, payload }`. On `410 Gone` / `404`, deletes the subscription row.
- Called from `evaluate-alerts` and from a "Send test notification" button on the new page.

## 7. New page: `/notifications` (Business Pulse Center)

Linked from sidebar under Admin (visible per `usePagePermissions` rule key `notifications`).

Three sections using existing `PageHeader`, `card-glass`, `KpiGrid`, chips, `format` utils, Inter/Space Grotesk:

a) **This device** card
- "Enable push on this device" button — requests permission, subscribes with VAPID public key, stores in `push_subscriptions`.
- Status chip: `.chip-success` Enabled / `.chip-warn` Blocked / `.chip-neutral` Off.
- "Send test notification" button.
- iOS note: "Add to Home Screen first, then open the installed app to enable."

b) **My alert rules** table
- Columns: Name, Metric, Venue, Condition (`< HK$ 80,000`), Severity chip, Enabled toggle, Edit, Delete.
- "+ New rule" opens a dialog: name, metric dropdown (with friendly labels + units), venue picker (incl. "All"), operator, threshold (numeric input, currency-formatted preview), severity, audience roles (multi-select), enabled.
- Preview block at the bottom of the dialog shows: "Right now this rule **would / would not** fire — current value: HK$ 72,140".

c) **Recent alerts** list (last 30 days from `alert_events`) — date, rule name, metric value vs threshold, severity chip.

## 8. Wiring

- New `usePushSubscription` hook (subscribe/unsubscribe/test).
- New `useAlertRules` hook (CRUD).
- Add `notifications` page key to `user_page_permissions` defaults in `handle_new_user_access` (admin/manager view).
- Add sidebar entry in the Admin section (`mem://layout/sidebar-navigation/main-structure`).

## Technical notes

- Push works on installed iOS PWAs (iOS 16.4+) only — surfaced as inline help on the page.
- All currency in the dialog/preview uses `@/utils/format`; all status pills use existing `.chip` classes; tables use `card-glass`.
- `web-push` runs in Deno via `npm:web-push@3`.
- Cron is scheduled via `supabase--insert` after deploy (per project rules), not via the migration tool.
- No edits to `src/integrations/supabase/*`.

## Out of scope

- Real-time / on-data-entry triggers (only daily run at 21:00 HKT).
- Email/SMS fallback.
- Native (Capacitor) push.
