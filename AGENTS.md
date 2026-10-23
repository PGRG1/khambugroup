# Project Architecture Rules

- ThemeProvider enforces fixed light resolution without profile or OS hydration; AppLayout mounts one pointer-inert viewport-fixed atmosphere as the first tenant wrapper child behind the floating sidebar and main content, with tenant-scoped glass tokens (including mobile portals), preserving platform styles and overlay stacking.

- All invoice-scanner product links must use `buildMatchLinkPatch`; this keeps supplier-specific Items Master display/save fields atomic while preserving scanned matching evidence.
- Scanner price updates must write the linked supplier entry first and synchronize canonical item cost fields from that supplier conversion; prices are supplier-specific.- "Your Finance Team" figures come only from `supabase/functions/_shared/financeTeamReview.ts`; the `finance-team` function may use AI to word those facts but must reject output with unknown numbers or finding keys, so reviews stay grounded.
- Finance team review snapshots are written only by the `finance-team` function (service role) and are locked by a trigger once finished; history must never be edited.
- Revenue navigation is mounted once inside AppLayout, with route selection and effective-user page access shared by its sidebar destination and local bar; existing page guards and datasets remain independent.
- KPI navigation is mounted once inside AppLayout; its direct sidebar link uses effective-user page visibility/access and its local tabs use existing KPI capabilities, keeping route guards and secondary page controls independent.
- People navigation is mounted once inside AppLayout on HR routes, with most-specific-path tab selection; its direct sidebar link preserves existing visibility and all HR AdminRoute guards remain independent.
