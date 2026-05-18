# Editable P&L Structure

## Goal
Replace the hardcoded P&L body (everything below Revenue, above Key Ratios) with a user-managed structure. Two row kinds:
- **Item** — manual line, amount from `pl_manual_lines` (already exists, edited inline per month)
- **Sum** — auto-totals every `item` row above it, up to the previous `sum` or `section`

Plus supporting `section` (bold header, no value) and `spacer` (blank row) kinds.

## What stays automatic (data-derived, not user-editable)
- **Revenue block** at top — per-venue Gross Revenue / Service Charge / Discounts / Net Sales / Total Revenue (from sales data)
- **Computed footer** — Gross Profit, Gross Margin, EBITDA, EBITDA Margin, EBIT, Net Operating Profit, Key Ratios. These reference `Total Revenue` plus the signed sum of every item, so they keep working no matter how the user restructures things.

Everything **between** Revenue and the computed footer is fully editable: add/remove/reorder sections, items, and sum lines freely.

## Data model
New table `pl_structure_rows`:
- `kind` — `section` | `item` | `sum` | `spacer`
- `label` — display name (for `item`, this is also the `line_item_name` linking to `pl_manual_lines`)
- `sort_order` — integer for ordering
- `indent` — 0/1/2 for nesting
- `is_bold` — emphasizes totals

Seed with the current structure (COGS, Rent & Related, Salaries, Utilities, Other OpEx, D&A) so nothing visually changes on first load.

## UI changes (`src/pages/PLReport.tsx`)
1. Render the editable middle from `pl_structure_rows`, computing sum values on the fly (walk rows; sum = total of preceding items up to previous sum/section).
2. **Inline controls** on each row (visible on hover, gated by `pl-report.edit_values`):
   - `+` insert item / sum / section below
   - `✕` remove (also cascades the `pl_manual_lines` rows when removing an item)
   - `↑` / `↓` reorder
3. New **Structure editor dialog** (replaces "Edit Manual Profit & Loss Inputs" or sits alongside it) showing the full ordered list with add/remove/reorder + rename.
4. Inline cell editor (`PLInlineCell`) keeps working unchanged for item rows.

## Files
- New migration: create `pl_structure_rows` + seed current layout
- New: `src/components/pl/PLStructureEditor.tsx` (dialog)
- Edit: `src/pages/PLReport.tsx` — replace hardcoded `buildLines` middle section with structure-driven rendering + inline row controls
- Edit: `src/components/pl/PLAddLineItem.tsx` — extend to support adding a sum row too (or fold into inline controls)
- Edit: `src/utils/generatePLReport.ts` — read from same structure so PDF stays consistent

## Out of scope
- Reorganizing the Revenue block or moving sales-derived numbers
- Multi-tenant structures (single global structure for the workspace)
