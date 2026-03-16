

## Summary

This plan covers four changes to the Revenue dashboard:

1. Add two new KPI boxes: "Sales / Day" and "Guests / Day"
2. Add a new "Avg Sales by Day of Week (MoM)" chart before the existing "Avg Guests by Day of Week" chart
3. Rename all "Customer" references to "Guest" across the dashboard charts
4. Fix the "Discount Report" chart -- rename to "Discount Trend" and fix its layout to stretch full width like other charts

---

## Changes

### 1. KPICards.tsx -- Add "Sales / Day" and "Guests / Day"

- Accept two new props: `salesPerDay` and `guestsPerDay`
- Insert two new card entries after "Total Discount":
  - "Sales / Day" showing `$X` with DollarSign icon
  - "Guests / Day" showing `X` with Users icon
- Update grid to `lg:grid-cols-8` (8 KPI boxes total) to accommodate the new cards

### 2. Index.tsx -- Compute and pass new KPI values

- Calculate unique days count from filtered data
- Compute `salesPerDay = totalSales / uniqueDays` and `guestsPerDay = totalGuests / uniqueDays`
- Pass both new values to `KPICards`

### 3. salesUtils.ts -- Add `sales_` keys to `getDayOfWeekStats`

- Inside the `getDayOfWeekStats` function, add `sales_{month}` entries alongside the existing `guests_`, `spendPerGuest_`, and `spendPerOrder_` keys
- This computes the average total sales per day-of-week per month

### 4. DashboardCharts.tsx -- Multiple updates

**a. Add "Avg Sales by Day of Week (MoM)" chart**
- Insert a new chart card before the existing "Avg Guests by Day of Week" chart (before line 229)
- Uses `dayStats` data with `sales_{month}` keys
- Same grouped bar chart pattern, Y-axis formatted as `$Xk`

**b. Rename all "Customer" references to "Guest"**
- "Daily Number of Customers" -> "Daily Guests"
- "Avg Daily Customers" -> "Avg Daily Guests"
- "Avg Customers by Day of Week (MoM)" -> "Avg Guests by Day of Week (MoM)"
- "Avg Spend Per Customer" -> "Avg Spend Per Guest"
- "Avg Spend/Customer" -> "Avg Spend/Guest"
- Monthly view: "Avg Customers/Day" -> "Avg Guests/Day", "Avg Customers/Order" -> "Avg Guests/Order", etc.
- Update tooltip labels and data key names in monthly averages (`customersPerDay` -> `guestsPerDay`, `customersPerOrder` -> `guestsPerOrder`)

**c. Fix Discount chart and rename**
- Rename "Discount Report" to "Discount Trend"
- Add `lg:col-span-2` class to make it span full width like other full-width charts
- This fixes the chart not stretching to the right border

---

## Technical Details

**Files modified:**
- `src/components/dashboard/KPICards.tsx` -- new props and cards
- `src/pages/Index.tsx` -- compute salesPerDay/guestsPerDay
- `src/utils/salesUtils.ts` -- add sales data to day-of-week stats
- `src/components/dashboard/DashboardCharts.tsx` -- new chart, renames, discount fix

