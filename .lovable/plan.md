# Dark Theme Redesign + Format Standardization

Move the whole app from the warm cream/terracotta palette to a **modern dark slate** theme with a **blue primary accent**, and unify text, table, dropdown, date, number and currency formatting across every page.

## 1. Design tokens (`src/index.css` + `tailwind.config.ts`)

Replace the `:root` HSL tokens with a slate-based dark palette (no `.dark` class needed — dark is the only mode). Update gradients, shadows and the `.pl-table` token block to match.

```text
--background        222 47% 8%     // #0F172A near
--foreground        210 40% 96%
--card              222 39% 12%    // #1E293B
--card-foreground   210 40% 96%
--popover           222 39% 14%
--primary           217 91% 60%    // #3B82F6 blue
--primary-foreground 0 0% 100%
--secondary         215 28% 18%
--muted             215 25% 16%
--muted-foreground  217 15% 65%
--accent            217 91% 60%
--destructive       0 72% 55%
--border            215 22% 22%
--input             215 22% 22%
--ring              217 91% 65%
--sidebar-background 222 45% 9%
--sidebar-accent    217 30% 18%
--sidebar-primary   217 91% 60%
--chart-1..5        blue/cyan/violet/emerald/amber on dark
```

Also update:
- `--gradient-card` → subtle slate gradient
- `--shadow-card` / `--shadow-glow` → blue-tinted shadow on dark
- `.text-gradient-gold` → rename usage stays, but redefine to a blue→cyan gradient (keep class name for compatibility, or replace with `text-gradient-brand`)
- `.pl-table` tokens → slate variants so the P&L still has visible row striping on dark
- `body` keeps DM Sans / Space Grotesk fonts (no font change requested)

## 2. New shared format helpers (`src/utils/format.ts`)

Single source of truth for all numeric/date display:

```ts
export const formatCurrency = (n: number, opts?: { decimals?: 0|2; sign?: boolean }) => string
   // → "HK$ 1,234.56"  (default 2 decimals, no forced sign)
export const formatCurrencyCompact = (n: number) => string  // "HK$ 12.3K / 1.2M"
export const formatNumber = (n: number, decimals=0) => string
export const formatPercent = (n: number, decimals=1) => string
export const formatDate = (d: string|Date) => string         // "03 May 2026"
export const formatDateShort = (d: string|Date) => string    // "03 May"
export const formatMonth = (d: string|Date) => string        // "May 2026"
export const formatDateTime = (d: string|Date) => string     // "03 May 2026 14:32"
```

Locale `en-HK`, currency code displayed as `HK$` prefix manually so we control spacing.

Then **sweep all 49 files** that use `formatCurrency` / `toLocaleString` / `toLocaleDateString` / `Intl.NumberFormat` to import from `@/utils/format`. The existing `formatCurrency` in `salesUtils.ts` becomes a thin re-export so old imports keep working, then we migrate them in batches.

PDF/CSV generators (`generateReport.ts`, `generatePLReport.ts`, CSV exports) also switch to these helpers so exports match the UI exactly.

## 3. Shared UI primitives audit

Standardize the look of these so every page is consistent on dark:

- **Table** (`src/components/ui/table.tsx`): add subtle row hover (`hover:bg-muted/40`), zebra option via `data-zebra`, sticky header utility, right-aligned numeric cell helper class `td-num` (tabular-nums, font-mono-ish).
- **Input / Textarea / Select / Popover / Dropdown / Dialog / Sheet / Tabs / Card / Badge / Button**: all already use CSS vars, so they pick up the new tokens automatically. Verify focus rings (`--ring`) and disabled states read well on dark; tighten where needed.
- **Sidebar** (`AppSidebar.tsx`): keep structure, restyle the `KHAMBU` wordmark to use the new blue gradient, active-link bg uses `bg-primary/15 text-primary`.
- **AppLayout header**: dark bg, border-b uses `--border`.
- **`card-glass` utility**: keep the class name, redefine to slate gradient + 1px border + soft blue shadow — every existing card inherits the new look with zero per-file changes.
- **Charts** (`components/ui/chart.tsx` and chart consumers): swap chart palette to the new `--chart-1..5`, set tooltip bg to `--popover`, gridline stroke to `--border`.
- **Dropdown logic**: keep current Radix `Select` behaviour (already memo'd to filter empty strings — core rule preserved). Standardize trigger height (`h-9`), chevron icon, and option row padding across every Select usage.

## 4. Page-level sweep

For each route under `src/pages/**`, do a quick visual pass to:
- Replace any hard-coded light hex colors (`#fff`, `bg-white`, `text-black`, cream/orange literals) with token classes.
- Replace inline `toLocaleString`/`toLocaleDateString`/manual currency strings with the new helpers.
- Ensure tables use the unified `<Table>` primitives with the `td-num` class on numeric columns.
- Ensure date pickers / filter chips / KPI cards / modals all use `card-glass` or `bg-card`.

Files needing the most attention (based on hex/literal scans): `PLReport.tsx`, `Index.tsx`, `Invoices.tsx`, all `pages/finance/*`, all `pages/hr/*`, `components/dashboard/*`, `components/forecast/*`, `components/procurement/*`, `components/pl/*`, `components/hr/*`, `components/invoices/*`.

## 5. PDF / Print themes

`generateReport.ts` and `generatePLReport.ts` currently use orange branding. Switch the PDF accent color to the new blue (`#3B82F6`) and run them through their existing color-mapping constants. Keep paper background white (PDFs stay light for printing) but headers/totals use the new blue.

## 6. Memory updates

After implementation, update these memory entries to reflect the new identity:
- Core: change "Warm/light aesthetic. Cream backgrounds, terracotta/gold accents" → "Dark slate aesthetic (#0F172A bg, #1E293B cards). Primary blue #3B82F6. Use shared helpers in `@/utils/format` for all currency/date/number display."
- `mem://style/visual-aesthetic` → rewrite for dark slate + blue.
- `mem://features/pl-report/styling` and `mem://features/pl-report/export` → blue accent instead of orange.
- Add new `mem://style/format-helpers` describing `@/utils/format` as the single source of truth.

## Out of scope

- No layout/IA changes, no component rewrites beyond styling and format calls.
- No font change.
- No changes to business logic, data fetching, RLS, or routing.

## Deliverable

After approval, the app will look uniformly dark-slate + blue across Revenue, Finance, Procurement, HR and Admin, and every currency/date/number on screen and in exports will follow `HK$ 1,234.56` / `DD MMM YYYY`.
