
# Global Theme System (Light / Dark / System) + Bani Footer

## 1. Foundations — design tokens

Rewrite `src/index.css` so all colors live in CSS variables (HSL, to stay compatible with the existing Tailwind `hsl(var(--token))` setup). Two palettes:

- `:root` → Light (Dusty Blue + Copper)
- `.dark` → Dark (Deep Navy + Copper)

Map the existing shadcn tokens (`--background`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--border`, `--input`, `--ring`, `--sidebar-*`, `--destructive`, `--chart-1..5`) plus new semantic tokens:

- `--success`, `--warning`, `--info`
- `--text-primary`, `--text-secondary`, `--text-muted`
- `--surface-panel`, `--surface-muted`
- `--chart-grid`
- `--accent-secondary` (copper-2)

Light values from spec: app `#F6F8FB`, card `#FFFFFF`, sidebar `#102A43`/`#243B53`, border `#D9E2EC`, copper `#B87333`, text `#102A43`/`#627D98`, success/danger/warning per spec.

Dark values from spec: app `#0B1726`, card `#14263B`, panel `#1A2E45`, sidebar `#08111D`/`#1A2E45`, border `#243B53`, copper `#B87333`/`#D4A373`, text `#F8FAFC`/`#A8B3C2`/`#7B8A9A`, chart grid `#2A3B52`.

Both palettes keep copper `#B87333` as `--primary` so the brand stays consistent. Update `tailwind.config.ts`:
- Add `darkMode: ["class"]` (already set) — verify
- Extend `colors` with `success`, `warning`, `info`, `chart-grid`, `surface-panel`, `surface-muted`
- Extend `chart` palette to 8 entries (copper, blue, teal, green, purple, rose, gold, slate) with light/dark variants driven by tokens

Update `.gradient-gold` and `.text-gradient-gold` to use copper tokens so KHAMBU wordmark stays branded in both themes.

## 2. Theme provider + persistence

New `src/components/theme/ThemeProvider.tsx`:
- Context exposes `{ theme: 'light'|'dark'|'system', resolvedTheme, setTheme }`
- Reads initial value from `localStorage('khambu.theme')`, fallback `light`
- Applies/removes `.dark` class on `<html>`
- Listens to `matchMedia('(prefers-color-scheme: dark)')` when `theme==='system'`
- Persists per-user: when authenticated, also writes to a new `profiles.theme_preference` column (so it survives device changes / re-login)

Migration: add nullable `theme_preference text` to `profiles` (values: `light|dark|system`). On login, hydrate from profile if present; on change, update both localStorage and profile.

Inline pre-hydration script in `index.html` to set the `.dark` class before React mounts (prevents FOUC).

Wrap `App.tsx` with `<ThemeProvider>` at the root.

## 3. Theme switcher UI

New `src/components/theme/ThemeSwitcher.tsx` — segmented control with Sun / Moon / Monitor icons, active item filled with copper.

Placement:
1. **Top-right user menu**: add a header user dropdown (currently the layout only has a `SidebarTrigger`). New `src/components/UserMenu.tsx` rendered in `AppLayout.tsx` header — shows email, "Appearance" submenu (Light / Dark / System), Sign Out.
2. **Settings page**: add an "Appearance" card to `src/pages/Settings.tsx` with the same switcher + description.

## 4. Sidebar — KHAMBU brand + Bani footer

Edit `src/components/AppSidebar.tsx`:
- Keep the KHAMBU wordmark and "Analytics Dashboard" tagline as today.
- Replace the current footer block to add, **above** the email/sign-out row, a small "Powered by **Bani**" line — muted text, copper accent on "Bani", separator line. Subtle, never replaces KHAMBU.
- Sidebar tokens already drive bg/active state — verify dark/light variants render correctly via `--sidebar-*` tokens (no structural change).

## 5. Chart theming

New `src/lib/chartTheme.ts` exporting:
- `useChartColors()` hook returning the 8-color palette resolved from CSS vars for the current theme
- `chartGridColor()`, `chartTooltipStyle()` helpers

Update recharts usages (`Dashboard.tsx`, `DashboardCharts.tsx`, `CumulativeSalesChart.tsx`, `PaymentBreakdownChart.tsx`, `ScatterAnalysisCharts.tsx`, `VenuePerformanceChart.tsx`, `ForecastCharts.tsx`, `InvoiceAnalytics.tsx`, `ProcurementDashboardTab.tsx`, `AssistantChart.tsx`) to:
- Read stroke/fill from `useChartColors()` instead of hard-coded hex
- Use `var(--chart-grid)` for `<CartesianGrid>` stroke
- Use themed tooltip background/border

This is a mechanical pass — no logic change.

## 6. Audit hard-coded colors

Sweep the codebase for raw hex / `text-white` / `bg-slate-*` etc. that break in light mode and replace with semantic Tailwind classes (`bg-card`, `text-foreground`, `border-border`, `bg-muted`, `text-muted-foreground`). Priority files: chip styles in `index.css` (`.chip-success/info/warn/danger/neutral`), KPI cards, P&L table classes (`.pl-table`), status badges, modals.

The existing app already uses semantic tokens widely, so this is targeted cleanup, not a rewrite.

## 7. Number / date formatting

`src/utils/format.ts` already exists per memory. Verify it exports `formatCurrency`, `formatNumber`, `formatPercentage`, `formatDateShort`, `formatDateTable`, `formatMonthLabel`, `formatAccountingAmount`. Add any missing helpers; do not refactor existing call sites in this pass beyond what's needed to keep things rendering.

## Files to add
- `src/components/theme/ThemeProvider.tsx`
- `src/components/theme/ThemeSwitcher.tsx`
- `src/components/UserMenu.tsx`
- `src/lib/chartTheme.ts`
- `supabase/migrations/<ts>_add_theme_preference.sql`

## Files to edit
- `src/index.css` (token rewrite + `.dark` block)
- `tailwind.config.ts` (extra semantic colors)
- `index.html` (pre-hydration script)
- `src/App.tsx` (wrap with ThemeProvider)
- `src/components/AppLayout.tsx` (mount UserMenu in header)
- `src/components/AppSidebar.tsx` (Powered by Bani footer)
- `src/pages/Settings.tsx` (Appearance section)
- All recharts files listed in §5
- Targeted hard-coded-color cleanup files from §6

## Out of scope (call out)
- No layout/structural changes to any page — only colors, per the UX rule.
- Workspace name stays **KHAMBU**; Bani only appears in sidebar footer.
- Not migrating every legacy `text-white` instantly — I'll fix the visible offenders (sidebar, header, chips, KPI/Settings/Dashboard) and leave deep-page polish for follow-ups if any slip through.

## Open questions
None — defaults from spec used (Light default, per-user persistence in `profiles.theme_preference`, copper `#B87333` as primary in both modes).
