

## Pre/Post Shift Tracking Plan

The shift modal currently lacks fields for tracking what actually happened after a shift (actuals, no-show, status, notes). The `hr_shifts` table already has columns for this: `actual_start_time`, `actual_end_time`, `actual_hours_worked`, `variance_minutes`, `no_show`, `status`, and `notes`. They just aren't exposed in the UI.

### What will be built

**Enhance the Shift Detail Modal** (in `AttendanceTab.tsx`) to show two sections:

1. **Scheduled (Pre)** -- the existing shift type, start/end time fields (already there)

2. **Actual (Post)** -- new section visible when editing an existing shift:
   - **Status** selector: Scheduled, Completed, Cancelled, No Show (already defined as `SHIFT_STATUSES`)
   - **No Show** toggle (auto-set when status = "No Show")
   - **Actual Start / Actual End** time inputs
   - Auto-calculated **Actual Hours** and **Variance** display
   - **Notes/Comments** textarea for managers to record what happened (e.g., "Called in sick at 3PM", "Left early due to emergency")

3. **Visual indicators on the roster grid** (in `WeeklyScheduleView.tsx`):
   - Small icon or color accent on shift cells that have been marked as no-show, completed, or have notes
   - E.g., a red dot for no-show, green check for completed, yellow dot if notes exist

### Technical approach

- **No database changes needed** -- all required columns already exist on `hr_shifts`
- **File: `src/components/hr/AttendanceTab.tsx`**:
  - Add "Actuals" section to the shift modal after the time grid, with status selector, no-show checkbox, actual time inputs, and notes textarea
  - Wire these to `updateField` calls on `editingShift`
  - Auto-compute variance display inline
- **File: `src/components/hr/WeeklyScheduleView.tsx`**:
  - In `formatShiftCell` or the cell renderer, add small status indicators (icons/dots) for shifts with `no_show`, `status === "completed"`, or non-empty `notes`

