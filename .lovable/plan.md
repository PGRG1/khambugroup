# Plan: Add MTD Procurement Performance section

Update only `src/components/procurement/ProcurementDashboardTab.tsx`. Insert a new section right after the KPI card grid (after line 478) and before the existing Monthly/Daily Spend vs Revenue chart (line 480). Reuse all existing data (`invoices`, `salesRecords`), the existing `Card`, `recharts`, palette, tooltip styles, and the `fmt`/`fmtShort` helpers — no new libraries, no new data fetches.

## Target month resolution

Derive a single `mtdMonth = { year, month }`:
- If `selectedMonth` matches `YYYY-MM` (single-month filter) → use it.
- Otherwise (`all` or `custom`) → use the **current** calendar month (`new Date()`).

Subtitle inside the section: `Selected month view` when single-month; otherwise `Current month view`.

## Computed datasets (useMemo)

Build using full `invoices` + `salesRecords` (not `filteredInvoices`, since this section has its own month).

1. `mtdDaily`: array of every calendar day of `mtdMonth` (1..daysInMonth) with:
   - `day` (number, 1..N) and `label` (e.g. `5 Jun`)
   - `dailySpend` (sum of `invoices.total_amount` where `invoice_date` is that day, else 0)
   - `cumulativeSpend` (running sum)
   - `dailyRevenue` (sum of `sales_records.total_sales` for that day; `null` if no record exists for the day)
   - `spendPctRevenue` = `dailyRevenue > 0 ? dailySpend/dailyRevenue*100 : null` (no fake values)

2. `mtdVsLastMonth`: array indexed by day-of-month 1..max(daysInThisMonth, daysInPrevMonth) with:
   - `day`
   - `currentCum` (cumulative spend up to that day in current month, or `null` past month length)
   - `prevCum` (cumulative spend up to that day in previous month, or `null` past prev month length)

## Layout

Wrap in a `space-y-4` block placed between the KPI grid and the Monthly/Daily chart:

```text
┌─ MTD Procurement Performance ────────────────┐
│ subtitle                                     │
│ ┌───── Cumul. Spend ─┐ ┌── Spend % Rev ────┐ │
│ │  LineChart         │ │  LineChart        │ │
│ └────────────────────┘ └───────────────────┘ │
│ ┌────────── MTD Spend vs Last Month ───────┐ │
│ │  LineChart (2 lines)                     │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

Grid: `grid grid-cols-1 lg:grid-cols-2 gap-4` for the first two; full-width `Card` underneath. Each chart in an existing-style `Card` with `CardHeader pb-2` + `CardTitle text-sm font-medium`, body `<div className="h-[260px]">` with `ResponsiveContainer`.

## Chart specs (recharts, reuse palette + tooltipStyle)

- **Cumulative Spend MTD**: `LineChart` with X `label`, Y `fmtShort`, line on `cumulativeSpend` (`hsl(24, 80%, 50%)`). Tooltip formatter shows Date / Daily spend (`fmt(dailySpend)`) / Cumulative (`fmt(cumulativeSpend)`).
- **Spend as % of Revenue**: `LineChart` on `spendPctRevenue` (`hsl(175, 55%, 42%)`), Y tick `${v.toFixed(0)}%`, `connectNulls={false}`. Tooltip: Date, Daily spend, Daily revenue (or `—` if null), Spend %.
- **MTD Spend vs Last Month**: `LineChart` with two `Line`s — `currentCum` (`hsl(24, 80%, 50%)`) and `prevCum` (`hsl(258, 50%, 55%)`), `connectNulls={false}`, `Legend`. Custom tooltip content (use Recharts `content` prop) showing: Day N, Current `fmt`, Previous `fmt`, Δ$ `fmt(current-prev)`, Δ% `((current-prev)/prev*100).toFixed(1)%` (skip Δ% if prev is 0/null).

## Non-changes (explicit)

KPI cards, Monthly/Daily Spend vs Revenue chart, Supplier sections, Category section, Bill/Invoice chart, Price Changes, Supplier Detail, date filter UI, palette, fonts, spacing, business logic — all untouched.
