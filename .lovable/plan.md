
# Reports — overflow / spillage bug-fix pass

Scope: CSS/containment only. No calc/data changes, no restyling.

## What "flow diagram" is

There isn't a Sankey/ReactFlow graph. The thing that reads as a "flow" is the **Statement of Cash Flows card** in `src/pages/finance/CashflowStatement.tsx` (lines 190–315): a centred `KHAMBU Group` heading, then Opening → Operating → Investing → Financing → Net Change → Closing rendered top-to-bottom. That's the target for #2 below.

## Bugs identified

### A. KPI boxes that let numbers spill out

1. **`src/components/expenses/shared.tsx` — `KpiCard`, lines 115–123.**
   Value div has `whitespace-nowrap` + inline `style={{ overflow: "visible" }}`. On a 7-col `KpiGrid` (line 135, `xl:grid-cols-7`) or 4-col at md, long HKD amounts (e.g. `HK$ 12,345,678`) render *outside* the card, over neighbouring tiles. The comment claims "long values wrap to fit" but `whitespace-nowrap` + `overflow:visible` do the opposite.
   Affects: **LedgerPL** KPI row (lines 433–438), **BillsExpenses** (lines 363–368), and every other page using `KpiCard`.

2. **`src/pages/finance/Cashflow.tsx` — local `KPICard`, lines 380–402.**
   `<div className="text-2xl font-bold font-mono">{value}</div>` has no `min-w-0`, no truncate, no responsive shrink. Long HKD figures spill the card on the 2-col mobile / 4-col desktop grid (line 168). Also uses hardcoded `text-rose-700` / `text-emerald-700` — not asked to restyle, but same fix line will drop these into tokens if trivial (otherwise leave).

3. **`src/pages/finance/BalanceSheet.tsx` — `StatTile`, lines 213–223.**
   `text-xl font-display ... tabular-nums` with no `truncate` / `min-w-0`. In the `sm:grid-cols-3` grid at line 145, long "HK$ 12,345,678.90" values push into neighbour column.

4. **`src/pages/finance/TrialBalance.tsx` — `StatTile`, lines 332–341.** Same as BalanceSheet: `text-xl` value, no `min-w-0` or truncate, three-column grid.

5. **`src/pages/finance/Ledger.tsx` — `StatTile`, lines 254–260.** `text-lg sm:text-xl` value, same pattern, same overflow risk in a 4-tile row.

6. **`src/pages/finance/BalanceSheet.tsx` — bottom Balanced/Total card, lines 186–206.**
   Three inline blocks (`Total Assets` / status / `Total L+E`) each render `text-2xl font-display tabular-nums` with no `min-w-0`. On `sm:flex-row`, long amounts on both sides squeeze the middle "Balanced / Out of balance" text and spill past the card.

### B. Cashflow statement "flow" spillage

7. **`src/pages/finance/CashflowStatement.tsx` — `CollapsibleTrigger` grid, lines 236–246.**
   `grid grid-cols-[1fr_auto]` with a long `line.lineItem` label on the left and an amount on the right — but the label span (line 241) has no `min-w-0` / `truncate`, so it can push the right-hand amount off the card on narrow widths. Fix: `min-w-0` on the label wrapper + `truncate` on the text span, keep amount `shrink-0 tabular-nums whitespace-nowrap`.

8. **`src/pages/finance/CashflowStatement.tsx` — `StatementRow`, lines 442–453.**
   Same `grid-cols-[1fr_auto]`. The label span has no `min-w-0`, so a long "Net cash used in investing activities — venue name" collides with the amount. Amount span needs `whitespace-nowrap` (currently absent) so amounts like `(12,345,678.90)` don't wrap mid-parenthesis.

9. **`src/pages/finance/CashflowStatement.tsx` — statement card, line 190.**
   `Card className="card-glass p-6 md:p-8"` has no horizontal safety valve. On narrow viewports (≤400px) the amounts overflow the card since the outer wrapper (line 127) is only `max-w-[1400px]`. Add `overflow-x-auto` on the card wrapper (or `min-w-0` cascade) so worst-case content scrolls within the card instead of breaking the layout.

10. **`src/pages/finance/CashflowStatement.tsx` — centred header block, lines 191–198.**
    Not spilling today, but sits inside the same card as #9 — no change needed unless #9 changes structure. Note only.

11. **`src/pages/finance/CashflowStatement.tsx` — Reconciliation card, lines 332–347.**
    Flex `justify-between` rows without `gap` / `min-w-0` on the label side. Long left labels (`Cash account balances at 2026-07-14`) collide with `tabular-nums` amount. Add `gap-3` and `min-w-0 truncate` on the left span, `whitespace-nowrap shrink-0` on the amount.

### C. Miscellaneous spillage in reports tables

12. **`src/pages/finance/TrialBalance.tsx` — desktop Totals row, line 250.**
    `{isBalanced ? "✓ Balanced" : fmt(diff)}` renders inside a `w-36` cell alongside other `w-36` amount cells. Not overflowing today, but the "Balanced" text uses a Unicode ✓ that in some fonts pushes width. Low priority — flag only.

13. **`src/pages/finance/CashflowLedger.tsx` — inflow/outflow cells, lines 241–242.** Table cells use `tabular-nums` but no `whitespace-nowrap`. Under narrow widths the parenthetical negative wraps to two lines. Add `whitespace-nowrap`.

## Fix approach (all CSS-only, existing tokens)

All fixes reduce to the same three patterns:

- **KPI-value pattern**: replace `whitespace-nowrap`/`overflow:visible` with `min-w-0 truncate` on the value div; add `title={value}` for hover reveal so the full HKD number is still discoverable. Bump the desktop `KpiGrid` breakpoint from `xl:grid-cols-7` back to `xl:grid-cols-4` if 7 columns can't fit an 8-figure HKD amount without truncation (verify first — may leave alone if truncate handles it).
- **Two-column label/amount rows**: parent `grid grid-cols-[minmax(0,1fr)_auto] gap-3` (the `minmax(0,1fr)` fixes the min-content default that makes `1fr` never shrink), label span `min-w-0 truncate` with `title`, amount span `shrink-0 tabular-nums whitespace-nowrap`.
- **Flex tile rows** (BS bottom card, Reconciliation card): add `gap-3 min-w-0` on flex items, `whitespace-nowrap` + `shrink-0` on the amount side.

Files to touch:
- `src/components/expenses/shared.tsx` (KpiCard value div)
- `src/pages/finance/Cashflow.tsx` (local KPICard)
- `src/pages/finance/BalanceSheet.tsx` (StatTile + bottom summary card)
- `src/pages/finance/TrialBalance.tsx` (StatTile)
- `src/pages/finance/Ledger.tsx` (StatTile)
- `src/pages/finance/CashflowStatement.tsx` (CollapsibleTrigger row, StatementRow, statement card wrapper, Reconciliation card)
- `src/pages/finance/CashflowLedger.tsx` (inflow/outflow cells whitespace-nowrap)

No token additions, no palette changes, no new components. Verification: `tsgo`, then a Playwright pass at 1280 and 400 viewport width against `/finance/cashflow-statement`, `/finance/balance-sheet`, `/finance/pl-ledger`, `/finance/trial-balance`, `/finance/cashflow` — confirming no text escapes card boundaries and long HKD amounts either fit or truncate with a tooltip.

## Out of scope
- Calculation logic, hooks, data fetching.
- Visual redesign (colors, typography, spacing beyond the containment fixes above).
- Turning KPI cards into new component types.
- The `KpiGrid` 7-column choice unless verification shows it's the root cause.
