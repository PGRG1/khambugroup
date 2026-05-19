# Fix: Food/Beverage Cost auto-sync wiping manual values

## Root cause

In `src/hooks/usePLData.ts`, `buildPeriodData` unconditionally overrides Food Cost and Beverage Cost with the procurement total:

```ts
const proc = procurementCosts[prefix] || { food: 0, beverage: 0 };
manual["Food Cost"]    = -Math.abs(proc.food);
manual["Beverage Cost"] = -Math.abs(proc.beverage);
```

When the procurement aggregation returns `0` for a period (e.g. PostgREST embed of `product_master(level1_category)` returns no rows due to RLS, or the join simply yields nothing), the override forces both lines to `0`, **wiping the manual values the user typed in**. This is why April shows `—` on Food/Beverage Cost in the screenshot even though `pl_manual_lines` still has `Food Cost = -64,500` and `Beverage Cost = -73,543.53`.

The complementary symptom ("Base Rental disappears when Food/Beverage shows up") is the inverse perception of the same unconditional override: whenever procurement happens to deliver a non-zero number, the user assumes their typed value is gone; the typed value is actually still in DB but never displayed.

## Desired behaviour (per user feedback)

- Auto-sync stays the default for Food Cost / Beverage Cost.
- Manual entry is treated as an explicit override. If the user has typed a value into Food Cost / Beverage Cost for that period, that value wins.
- All other lines (Base Rental, Government Fees, etc.) remain pure manual and are never touched by the sync.

## Changes

### 1. `src/hooks/usePLData.ts` — fix override logic

Track whether a manual `Food Cost` / `Beverage Cost` row exists for the period **before** applying the default `0`:

- After looping `filtered` lines, capture `hasManualFood` / `hasManualBev` (true if `Food Cost` / `Beverage Cost` appeared in `filtered`).
- Keep the `KNOWN_LINES` zero-fill loop.
- Then apply procurement sync only when there is no manual override:
  - `if (!hasManualFood) manual["Food Cost"] = -Math.abs(proc.food);`
  - `if (!hasManualBev)  manual["Beverage Cost"] = -Math.abs(proc.beverage);`

This guarantees:
- Period with manual entry → manual value shown (negative, as user typed).
- Period without manual entry → procurement total shown as negative.
- Period with neither → `0` (renders as `—`).

### 2. Inline-edit UX for the two auto-synced rows

`PLInlineCell` currently writes whatever the user types into `pl_manual_lines`. With the fix above, that write automatically becomes the override. No code change needed — but verify after the patch that:
- Clicking Food/Beverage Cost shows the current displayed value, typing a number saves a manual override, and a refetch keeps the manual number on screen.
- Clearing the cell back to empty (saves as `0`) leaves a zero manual row. That zero row will (correctly under this rule) be treated as an explicit "user said zero" override and suppress procurement.
  - If we instead want clearing-to-empty to fall back to procurement, delete the row when the user saves `0`. **Open question — see below.**

### 3. Sanity-check procurement aggregation (no code change unless required)

The PostgREST query `invoice_line_items?select=...,product_master(level1_category)` only returns the embedded product when RLS on `product_master` allows the current user to read it. Quick verification after the fix is deployed: open the report logged in as the affected user and confirm procurement totals match the SQL aggregates (Apr 2026 → Food 64,451.77, Beverages 73,543.53). If they still come back as zero, the next step is to switch the procurement fetch to a server-side aggregate (RPC or view) so it does not rely on the embed.

## Open question

When the user clears a Food/Beverage cell (saves blank/0), should the report:
- (A) Show `0` (treat as an explicit override of zero), or
- (B) Delete the manual row so it falls back to the procurement auto-sync?

Default in this plan is (A) — simpler and matches the rest of the report. If (B) is preferred, `PLInlineCell` needs a small tweak to delete the row when the saved amount is `0` for `Food Cost` / `Beverage Cost`.
