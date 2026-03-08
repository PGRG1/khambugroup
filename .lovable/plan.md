

# Plan: Allow Adding Unscheduled Shifts from Actuals View

## Problem
In the Actuals view, empty cells (employees with no scheduled shift for a day) show a dash and are not clickable. This means you cannot record actuals for someone who wasn't originally scheduled but came in to work (e.g., covering a no-show).

## Changes

### `src/components/hr/ActualsComparisonView.tsx`
- Add an `onAddShift` callback prop (same signature as in Plan view: `(employeeId, date) => void`)
- Make empty cells clickable with a `+` icon on hover, calling `onAddShift(emp.id, dateStr)`
- Also make non-regular shift cells (AL, SH, etc.) clickable to allow overriding with an actual shift

### `src/components/hr/AttendanceTab.tsx`
- Pass `onAddShift={openNewShift}` to `ActualsComparisonView`
- When adding a shift from Actuals view, auto-open the modal with actuals section visible so the user can fill in both the scheduled and actual times in one go

## Files

| File | Action |
|------|--------|
| `src/components/hr/ActualsComparisonView.tsx` | Add `onAddShift` prop, make empty cells clickable with hover `+` indicator |
| `src/components/hr/AttendanceTab.tsx` | Wire `onAddShift` to ActualsComparisonView |

