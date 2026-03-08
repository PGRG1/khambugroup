

## Move "Copy Previous Week" Button Into the Staff Roster Table

**What**: Remove the "Copy Previous Week" button (and clipboard indicator) from the toolbar above the table, and place it in the top-right corner of the WeeklyScheduleView table header row — aligned with the last day column header.

**Why it works**: The button is only relevant when viewing the roster grid, so embedding it there reduces toolbar clutter and keeps it contextually close to the data it acts on.

### Changes

**1. `src/components/hr/AttendanceTab.tsx`**
- Remove the entire `{viewMode === "plan" && ...}` block (lines 400-413) containing the Copy Previous Week button and clipboard indicator
- Pass `copyPrevConfirmOpen`, `setCopyPrevConfirmOpen`, `shiftsToCopy`, `clipboard`, and `setClipboard` as props to `WeeklyScheduleView`

**2. `src/components/hr/WeeklyScheduleView.tsx`**
- Add new props: `onCopyPrevWeek`, `shiftsToCopyCount`, `clipboardIndicator` (or pass raw clipboard + setter)
- In the table header row, add the "Copy Previous Week" button and clipboard status indicator in the top-right cell (last column header area), styled small and subtle with `variant="outline" size="sm"`

