## Goal

Re-skin the existing Accounts Payable page to match the structure in the mockups. No backend changes — same data, same dialogs, just a clearer tabbed control-center layout where each tab carries its own contextual KPIs and filters.

## New tab structure

Replace today's tabs (`Invoices`, `By Supplier`, `Aging Summary`) and the always-on KPI strip with:

1. **Open Payables** — approved invoices with outstanding > 0
2. **Payment History** — all recorded payments
3. **Credit Notes** — supplier credit notes
4. **Aging Summary** — supplier-level aging matrix

(`By Supplier` and the Payroll Liabilities block fold into Open Payables as a collapsible section so nothing is lost.)

Page header keeps title + `Upload Invoice` / `Record Payment` buttons in the top-right.

## Per-tab KPI cards

Each tab gets its own KPI grid, computed in `usePayables` / on-page memos. No global KPI strip.

**Open Payables (6 cards)**
- Total Outstanding · `HK$` + invoice count
- Overdue · amount + count (red)
- Due in 7 Days · amount + count (sky)
- Paid This Month · amount (emerald)
- Awaiting Bank Match · count (sky)
- Credit Notes Available · sum of remaining balances + count (purple)

**Payment History (5 cards)**
- Total Paid This Month · sum + payment count (emerald)
- Payments Awaiting Match · count (amber)
- Matched Payments · count (sky)
- Partial Allocations · count where allocations < payment amount (amber)
- Unallocated Payments · count with no allocation (red)

**Credit Notes (5 cards)**
- Available Credit Notes · sum of remaining + count (purple)
- Applied This Month · sum from `payment_allocations.credit_note_amount_applied` (emerald)
- Unused Balance · remaining across non-fully-applied (sky)
- Fully Applied · count (emerald)
- Needs Review · count of CNs flagged or with status mismatches (amber)

**Aging Summary (6 cards)**
- Total Outstanding
- Current (0–30) · amount + %
- 1–30 Days · amount + %
- 31–60 Days · amount + %
- 61–90 Days · amount + %
- 90+ Days · amount + % (red)

Plus a thin stacked aging bar above the table (5 colored segments proportional to bucket weight) as a quick "Aging Overview".

## Per-tab filter bars

Compact filter rows above each table.

- **Open Payables**: Search · Supplier · Venue · Payment Status · Bank Match · Due Range · Paid-From · Clear
- **Payment History**: Search · Supplier · Payment Method · Paid-From Account · Date Range · Bank Match Status · Clear
- **Credit Notes**: Search · Supplier · Venue · Date Range · Status · Clear
- **Aging Summary**: Search · Supplier · Venue · Aging Bucket · Clear

## Tables

- **Open Payables** — current invoice table (unchanged columns, unchanged row actions: Record Payment, Allocate, View Payment History, Open Invoice)
- **Payment History** — new table sourced from `payments` + `payment_allocations`:
  - Columns: Payment Date · Payment Ref · Supplier · Paid From · Method · Total Amount · Allocated · Unallocated · Bank Match · Actions (View Allocation, View Payment, Match)
- **Credit Notes** — table from `credit_notes`:
  - Columns: CN Date · CN # · Supplier · Venue · Original · Applied · Remaining · Status · Linked Invoices · Actions (Apply, View)
  - "Apply" opens existing RecordPaymentDialog pre-scoped to that supplier (no new dialog needed)
- **Aging Summary** — keep current `AgingMatrix`-style supplier rows with View Supplier / Open Invoices actions

## Files to edit

- `src/pages/finance/Payables.tsx` — full restructure (tabs, KPI grids, filter bars, new Payment History + Credit Notes table sections)
- `src/hooks/usePayables.ts` — additionally expose: raw `payments` (with allocations joined), full `creditNotes` list (not just `remaining > 0`), `appliedCreditThisMonth`. Existing fields preserved.

## Out of scope

- No Payment Runs tab/table (skipped per your choice)
- No new dialogs — reuse `RecordPaymentDialog`, `AllocatePaymentDialog`, `PaymentHistoryDialog`
- No DB migrations, no schema changes
- No Upload Invoice action wiring (the button in mockups will link to existing Procurement invoice upload)

## Visual notes

- Use existing `card-glass`, `.chip-*` pills, JetBrains Mono for numbers, project's emerald/sky/amber/red accent tokens.
- KPI cards: large value, small label above, small sub-line below (count or "%"); icon top-right tinted per accent.
- Tables: zebra-free, `hover:bg-muted/20`, sticky header, compact `text-xs`.
