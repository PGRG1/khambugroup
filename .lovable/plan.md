

# Plan: Split Attendance Tab into Plan View & Actuals View

## Overview

Redesign the Attendance tab to have two clearly separated sub-views, toggled via a segmented control at the top:

1. **Plan View (Schedule)** -- The existing Weekly Schedule roster for forward-looking shift planning. This is essentially what's already there (WeeklyScheduleView + shift modal for creating/editing planned shifts).

2. **Actuals View (Reconciliation)** -- A new weekly table that shows each employee's planned shift alongside what actually happened, with variance highlighting for easy comparison.

---

## Technical Approach

### 1. Add a toggle at the top of AttendanceTab

A simple two-option toggle (`Plan` / `Actuals`) above the week navigation. Both views share the same week selector.

- **Plan** = current behavior (WeeklyScheduleView, add/copy shifts, KPI cards focused on scheduled hours)
- **Actuals** = new comparison table

### 2. Build the Actuals Comparison View (new component)

Create `src/components/hr/ActualsComparisonView.tsx`:

- **Layout**: A table with rows per employee, columns per day of the week.
- **Each cell shows two rows**:
  - Top row (muted): **Planned** time (e.g., "5PM - CLS") pulled from `hr_shifts.start_time / end_time`
  - Bottom row (bold): **Actual** time (e.g., "5:30PM - 1:00AM") from `actual_start_time / actual_end_time`
  - Color-coded variance badge (e.g., "+30min" in green, "-45min" in red, "No Show" in destructive)
  - Non-regular shifts (OFF, AL, SL) shown as status badges
- **Click a cell** to open the existing shift modal (scrolled to the Post-Shift Actuals section) for editing actuals
- **Summary row at bottom**: Total planned hours vs total actual hours per day, with variance

### 3. Adjust the Shift Modal

- When opened from the **Actuals** view, scroll or highlight the "Post-Shift Actuals" section
- The planned section (shift type, time grid) becomes **read-only** when accessed from Actuals view (prevents accidental plan changes during reconciliation)
- Add a visual "Planned vs Actual" summary banner at the top of the modal showing the comparison at a glance

### 4. Adjust KPI Cards

- In **Plan** mode: Show scheduled hours, headcount, leave days (forward-looking metrics)
- In **Actuals** mode: Show actual hours, attendance rate, no-shows, variance, payroll impact (backward-looking metrics)

The existing `ScheduleKPICards` already has both sets of data -- we just filter which cards display based on the active view.

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/hr/ActualsComparisonView.tsx` | **Create** -- New comparison table component |
| `src/components/hr/AttendanceTab.tsx` | **Modify** -- Add Plan/Actuals toggle, conditionally render WeeklyScheduleView or ActualsComparisonView, pass `viewMode` to modal |
| `src/components/hr/AttendanceTab.tsx` (modal section) | **Modify** -- Make plan fields read-only in actuals mode |

No database changes needed -- all data already exists in `hr_shifts` (planned + actual fields).

