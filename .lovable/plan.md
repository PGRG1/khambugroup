## Rebrand: Copper/Gold → Sage + Inter Typography

Scope: purely token-level changes in `src/index.css` and `tailwind.config.ts`, plus swap the Google Fonts import to Inter. No component logic touched.

### 1. `src/index.css` — Light mode tokens
- `--primary`: `27 60% 46%` → `72 20% 38%` (#71764F)
- `--ring`: same → `72 20% 38%`
- `--sidebar-primary`: `27 60% 56%` → `72 20% 38%`
- `--sidebar-ring`: → `72 20% 38%`
- `--accent`: `32 39% 36%` → `76 15% 51%` (#8B9370)
- `--gradient-gold`: `linear-gradient(135deg, hsl(72 20% 38%), hsl(76 24% 20%))` (#71764F → #383E28)
- `--shadow-glow`: swap the copper hsl for the new sage hsl (same alpha/spread)

### 2. `src/index.css` — Dark mode tokens
- `--primary`: → `68 18% 66%` (#B4B899)
- `--ring` / `--sidebar-primary` / `--sidebar-ring`: → `68 18% 66%`
- `--accent`: → `70 16% 60%` (#A3A88A)
- `--gradient-gold`: `linear-gradient(135deg, hsl(68 18% 66%), hsl(74 19% 74%))` (#B4B899 → #C2C9B1)
- `--shadow-glow`: swap to new sage hsl

### 3. Chart palette (both modes, in `src/index.css`)
Reassign the first five chart tokens to the cohesive sage family; leave `--chart-6/7/8` and `--chart-grid` alone. Keep `--success`, `--warning`, `--info` untouched so "on target" green stays visually distinct.

- `--chart-1`: sage `72 20% 38%` (#71764F)
- `--chart-2`: clay/terracotta `18 37% 48%` (#A66B4E)
- `--chart-3`: warm stone gray `36 7% 51%` (#8B8579)
- `--chart-4`: deep moss `76 24% 20%` (#383E28)
- `--chart-5`: dusty gold `36 33% 53%` (#B39257)

Dark mode uses the same five hues (they read well on the dark navy card surface); if any single one looks muddy in QA we'll lift its lightness by ~10%, but no structural change.

### 4. Typography — single-font Inter
- Google Fonts `@import` in `src/index.css`: replace DM Sans + Space Grotesk with Inter (weights 400/500/600/700).
- `body { font-family: 'Inter', sans-serif; }`
- `h1..h6 { font-family: 'Inter', sans-serif; }` (hierarchy from size/weight only)
- `tailwind.config.ts` `fontFamily`: both `sans` and `display` map to `["Inter", "sans-serif"]` so existing `font-display` classes across the app keep working — just render in Inter.

### 5. Explicit non-changes
- `--background`, `--card`, `--border`, `--muted`, `--sidebar-background`, `--sidebar-accent` — untouched.
- `--success` / `--warning` / `--info` — untouched (keeps "on target" green distinct from sage).
- `ThemeProvider` / `ThemeSwitcher` — untouched.
- No component files edited; the gradient class `text-gradient-gold` keeps its name, only its colors change.

### Verification
After the change: load `/` in both light and dark, confirm sidebar active state, primary buttons, "Revenue Overview" gradient heading, KPI positive chips (still green, not sage), and a chart-heavy page (Dashboard) all render correctly.
