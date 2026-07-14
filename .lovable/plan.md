
# P&L Report — Visual Design Pass (scoped)

Target file: `src/pages/PLReport.tsx` only. No changes to `usePLData`, `usePLStructure`, the `pl/*` editors, PDF export, or any calculation. Purely presentation.

## Current state (summary)

The page renders one wide table where every row is one of: `header`, `section`/`subheader`, `item`, `editable` (inline-edited manual input), `subtotal`, `total` (with an optional `bold` flag for the top-level total like Net Profit), `ratio`, `blank`.

Columns are period buckets (from `PLPeriodSelector`) plus an optional "Total" column separated by a left border. Numbers use `font-mono tabular-nums`, negatives go red, zeros render as `—`.

Issues to fix visually:
1. **Weak hierarchy.** `subtotal` and `total` both use warm-beige backgrounds only ~5% apart in lightness; `total.bold` (Net Profit) isn't unmistakably the final line. Section headers, subtotals, and grand total blur together at a glance.
2. **Hardcoded HSL values** (`hsl(30, 18%, 86%)` etc.) live inline instead of using the `--pl-*` tokens already declared in `index.css`. Any theme/dark-mode work is broken today; the palette drifts from the rest of Bani.
3. **Negatives inconsistent.** Numbers use a leading minus in red; accounting convention (and the rest of the finance suite via `fmt` in `LedgerPL`) uses parentheses. Editable cells (`PLInlineCell`) show unstyled minus too.
4. **Alignment / rhythm.** Row padding is uniform, so subtotals don't visually "close" a group. No top-of-column right-alignment guide; label column has no vertical divider from the numbers.
5. **Comparison clarity.** When multiple periods are shown side-by-side, all period columns look identical — no cue for the most-recent / rightmost period, and the "Total" column separator is only a 2px border.

## Proposed changes

All changes stay in `src/pages/PLReport.tsx` (plus one small tweak to `PLInlineCell` for parentheses on negatives, and the `--pl-*` tokens already in `index.css` — I'll only add 2–3 new tokens there if needed, matching the existing dusty-blue + copper palette).

### 1. Hierarchy — three unmistakable tiers
- **Line items (`item`, `editable`)**: no fill, single hairline bottom border in `--border/40`. Zebra stripes removed (they add noise and fight the subtotal cue). Muted-foreground label, foreground numbers.
- **Section subtotals (`subtotal`, `total` when *not* bold)**: `bg-muted/60`, top border `1px solid --border`, label in `font-semibold text-foreground`, numbers `font-semibold`. Sits flush against the last item row so it reads as "closing" the section.
- **Net Profit / grand total (`total` with `bold`)**: `bg-secondary` (dusty-blue tint in light, deep navy in dark — already themed), **double top border** `border-t-2 border-double border-foreground/60`, label uppercase tracked, numbers `text-base font-bold`. A single accent hairline in `--primary` (copper) sits above it as a separator, so Net Profit reads as a distinct summary row without a KPI card.
- **Section headers (`section`, `subheader`)**: no fill; small caps `text-[10px] uppercase tracking-[0.14em] text-primary/80`, generous top padding (`pt-5`) to create breathing room instead of a colored band.
- **Category headers (`header`, e.g. "REVENUE", "EXPENSES")**: `bg-secondary/60`, uppercase, no border-y — used as a chapter divider.

### 2. Numbers — accounting convention
- Replace the current `fmt` with the parenthetical variant already used in `LedgerPL.tsx`: `-1,234.56 → (1,234.56)`, zero → `—`. Negatives stay in `text-destructive`.
- Right-pad all number cells with a fixed right padding so the closing `)` aligns vertically across rows.
- Keep `font-mono tabular-nums`; bump number column `min-w-[128px]` so five-digit HK$ totals never wrap.
- `PLInlineCell`: when not editing, render through the same parenthetical formatter (2-line change in that file).

### 3. Column structure
- Sticky left label column: add a `border-r border-border/60` so labels visually detach from numbers.
- Period columns: unchanged spacing, but header row uses `bg-muted/40` (token) instead of the hardcoded beige.
- "Total" column: keep the left divider but upgrade it to `border-l-2 border-primary/40` so the summary column reads as the anchor.
- When multiple periods are selected, subtly de-emphasize non-latest period headers (`text-muted-foreground` vs `text-foreground` for the latest) so period-to-period scanning has a focal point. No layout shift.

### 4. Tokens only
- Delete every inline `style={{ background: 'hsl(30, 18%, 86%)' }}` and matching border colors. Route everything through existing tokens: `--background`, `--muted`, `--secondary`, `--border`, `--primary`, `--destructive`, `--foreground`. If two shades are still missing after the pass, add them to `index.css` as `--pl-subtotal` / `--pl-grand-total` (light + dark blocks) rather than inlining hex/hsl.
- Result: the page finally responds to dark mode and stops drifting from the rest of the app.

### 5. Spacing/typography
- Row height: items `py-[6px]`, subtotals `py-2`, grand total `py-2.5` — creates a subtle "weight" gradient down the page.
- Label column font: keep DM Sans body; grand-total label uses Space Grotesk (display font) to echo page headers.
- Ratio rows (`ratio`): italic `text-xs text-muted-foreground`, no fill, right-aligned percent — already close, just remove the beige tint.

## Out of scope (explicitly)
- No KPI cards above the table.
- No new charts, sparklines, or variance columns.
- No changes to `usePLData`, `usePLStructure`, period logic, structure editor, manual input editor, add-line-item flow, or PDF export.
- No new color palette — only existing dusty-blue/copper tokens plus at most 2 named subtotal tokens if strictly needed.
- `LedgerPL.tsx` (ledger-driven P&L) is not touched.

## Files that will change (when approved)
- `src/pages/PLReport.tsx` — row style logic, header styles, number formatter, token cleanup.
- `src/components/pl/PLInlineCell.tsx` — swap display formatter to parenthetical (~3 lines).
- `src/index.css` — only if two subtotal/grand-total tokens are needed; otherwise untouched.

## Verification
- `tsgo` typecheck.
- Visual: capture PLReport at 1280×1800 in light and dark mode with a multi-period selection to confirm hierarchy, parenthetical negatives, and Total-column anchor read correctly.
