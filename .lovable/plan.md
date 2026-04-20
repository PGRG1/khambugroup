
The user wants:
1. Tables (currently only inside the Revenue Target preview modal) to be visible directly on the Forecast page where the charts are — not hidden behind a modal.
2. A date range filter on those tables to narrow down which days are shown.
3. A "Download Image" / screenshot button readily available, capturing just the filtered range so they can share with the team (e.g., "April 20 only" to focus the team on specific days).

Let me check the current Forecast page structure to know exactly where charts live and how to insert the new table view.

### Current state
- `RevenueTargetPanel.tsx` already has per-venue tables + screenshot logic, but only inside the preview modal (after clicking "Generate").
- The Forecast page (`ForecastInput.tsx`) shows `ForecastCharts` for visualization.
- User wants the table version of the same data alongside / in place of those charts.

## Plan: Inline forecast tables with date filter + screenshot

### New component: `src/components/forecast/ForecastTableView.tsx`
A clean, screenshot-friendly table view of forecast vs actuals per venue:

- **Date range filter** at the top: two date inputs ("From" / "To") with quick presets (Today, This Week, This Month, All).
- **One table per venue** (based on currently selected venue/page), columns:
  - Date | Day | Forecast Sales | Actual Sales | Variance | Forecast Guests | Actual Guests | Notes
- **Footer row**: totals for the filtered range (Forecast total, Actual total, Variance, Gap to target if a target exists).
- **"Download PNG" button** (Camera icon) in the header — uses `html-to-image` to export only the filtered table (referenced via `useRef`).
- **"Copy to Clipboard"** secondary button (image to clipboard) — handy for pasting into Slack/WhatsApp.
- Card-glass styling, terracotta/gold accent, mono numbers — matches existing aesthetic.

### Integration in `src/pages/ForecastInput.tsx`
- Add a small **view toggle** above the charts area: `[ Charts | Table ]`.
- Default = Charts (current behavior). Switching to Table renders `ForecastTableView` in the same slot.
- Toggle persists in localStorage so the user's preference sticks.

### Dependency
- `html-to-image` (already added per earlier work). If missing, install it.

### Out of scope
- Editing forecasts inline from this table (read-only view).
- Multi-venue combined screenshot (one venue per page, matching the page context).

### Verification
1. Go to `/forecast/assembly` → click `Table` toggle → see all dates.
2. Set From=Apr 20, To=Apr 20 → only that row shows, totals update.
3. Click `Download PNG` → file downloads showing just Apr 20 row + header + totals, cleanly cropped.
4. Switch back to `Charts` → original view restored.
