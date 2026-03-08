

## Plan: Copy Previous Week + Copy & Paste Shift Cells

Two features to eliminate repetitive shift-by-shift entry:

### 1. Copy Previous Week Button
- Add a "Copy Previous Week" button next to the week navigation in `AttendanceTab.tsx`
- On click: fetch all shifts from the previous week, duplicate them into the current week (same employee, same times, same type, offset dates by +7 days)
- Skip dates that already have shifts to avoid duplicates
- Show a confirmation dialog with count of shifts to copy
- Batch insert via `onSaveShift` for each new shift

### 2. Copy & Paste Cells in the Roster Grid
- Right-click or click a shift cell to "copy" it (store shift details in component state: type, start_time, end_time)
- A small visual indicator (dotted border or highlight) shows the copied shift
- Click any empty cell (or existing cell) to paste — creates a new shift with the copied times for that employee+date
- Add a toolbar hint: "Click a shift to copy, click an empty cell to paste"
- Support multi-paste: copied state persists until user presses Escape or copies a different shift

### Files to modify:
1. **`src/components/hr/AttendanceTab.tsx`** — Add "Copy Previous Week" button with confirmation dialog, pass clipboard state to WeeklyScheduleView
2. **`src/components/hr/WeeklyScheduleView.tsx`** — Add copy/paste interaction: click-to-copy on existing shifts, click-to-paste on empty cells, visual feedback for copied state, paste indicator

### Technical details:
- Clipboard state: `{ shift_type, start_time, end_time } | null` stored in AttendanceTab and passed as prop
- Copy Previous Week: filter `shifts` where `shift_date` is in previous week range, then batch-create with dates offset by 7 days
- Use existing `onSaveShift` for creating pasted/copied shifts
- Confirmation dialog uses existing `AlertDialog` component

