

## Problem

When you mark a shift as "Not Completed as Planned" and select what happened (e.g., OFF, AL, SL), it overwrites the `shift_type` field on the shift record. Since the Weekly Schedule roster uses `shift_type` to decide what to display in each cell, the roster changes from showing the planned time range to showing "OFF" or "AL" etc.

## Solution

Add a new `actual_shift_type` column to the `hr_shifts` table to separate planned vs. actual shift types. This way, the roster always reads from `shift_type` (the plan), while actuals are stored separately.

### 1. Database Migration
- Add column `actual_shift_type` (text, nullable, default null) to `hr_shifts`

### 2. Update `useHRData.ts`
- Add `actual_shift_type` to the `HRShift` interface

### 3. Update `AttendanceTab.tsx` (Actuals Modal)
- When "Not Completed as Planned" sub-type is selected, write to `actual_shift_type` instead of `shift_type`
- When "Completed as Planned" is selected, set `actual_shift_type` to the current `shift_type` (i.e., same as planned)
- Read from `actual_shift_type` for the "What happened?" active state in the actuals section

### 4. Update `WeeklyScheduleView.tsx` (Roster)
- No changes needed — it already reads `shift_type`, which will remain the planned value
- The small status indicator dots (green for completed, red for no-show) stay as they are — these are useful visual cues that don't alter the planned cell content

This ensures the roster always shows the originally planned schedule, while actual outcomes are tracked in separate fields (`status`, `actual_shift_type`, `actual_start_time`, `actual_end_time`).

