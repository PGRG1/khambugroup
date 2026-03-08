

## Remove "Add Shift" Button from Plan View

**What**: Remove the "Add Shift" button from the plan view toolbar (line 412-414 in `AttendanceTab.tsx`). The "Copy Previous Week" button and clipboard indicator will remain.

**Change**: In `src/components/hr/AttendanceTab.tsx`, delete lines 412-414:
```tsx
<Button size="sm" onClick={() => openNewShift("", formatDate(weekDates[0]))}>
  <Plus className="h-4 w-4 mr-1" /> Add Shift
</Button>
```

Also clean up the `Plus` icon import if it's no longer used elsewhere in the file.

