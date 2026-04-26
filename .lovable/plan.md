# Make the portal use the full screen width

Currently the app is locked to a centered column. Two things constrain it:

1. **`src/App.css`** — sets `#root { max-width: 1280px; margin: 0 auto; padding: 2rem; text-align: center; }`. This caps the entire app at 1280px regardless of screen size and adds extra padding/centered text alignment that conflicts with the sidebar layout.
2. **Per-page wrappers** — every main page wraps content in `<div className="max-w-[1400px] mx-auto ...">`, capping content at 1400px even on 4K monitors.

On the user's 3490px-wide screen, this is why everything bunches in the middle.

## Changes

### 1. Remove global `#root` cap (`src/App.css`)
Strip the `#root` rule so it stops fighting the sidebar layout. Replace with:
```css
#root { width: 100%; min-height: 100vh; }
```
(Keep the rest of the file — logo/card styles — untouched in case anything still references them.)

### 2. Switch page wrappers from fixed cap to fluid with sane max
Replace `max-w-[1400px] mx-auto` with `w-full mx-auto` on these pages so they expand to fill the area provided by `AppLayout`'s main panel (which already has `p-3 sm:p-6 lg:p-8`):

- `src/pages/Index.tsx`
- `src/pages/DataPage.tsx`
- `src/pages/PLReport.tsx`
- `src/pages/AuditLog.tsx`
- `src/pages/ForecastInput.tsx`
- `src/pages/UserAccessControl.tsx`
- `src/pages/hr/HREmployees.tsx`
- `src/pages/finance/TrialBalance.tsx`
- `src/pages/finance/Ledger.tsx`
- `src/pages/finance/Journal.tsx`
- `src/pages/finance/ChartOfAccounts.tsx`
- `src/pages/finance/Cashflow.tsx`
- `src/pages/finance/BalanceSheet.tsx`

For ultra-wide readability on text-heavy pages (P&L, Trial Balance, Balance Sheet, Cashflow), I'll bump the cap to a much larger value like `max-w-[1920px]` instead of removing it entirely, so financial tables don't stretch to absurd widths on 4K. Dashboards (Revenue, Forecast, HR, Procurement-style) get true full-width (`w-full`).

### 3. No change to `AppLayout`
The sidebar + main flex layout is already correct — `<main className="flex-1 ...">` already grows. Removing the `#root` and per-page caps is enough.

## Result

- Laptops (1366–1920px): looks the same or slightly wider, no regression.
- Large monitors (2560px+): dashboards, charts, and tables expand to use the available space.
- Mobile: untouched — existing responsive padding and grids still apply.
