

## Fix: Edit Invoice — Calculation, Read-Only Total, and Cleanup

### Root Cause
The edit invoice table's **Total column is editable** (line 1126), which means:
1. Old wrong totals loaded from the DB (saved before the fix) persist and users can override the auto-calculated value
2. Even though `updateEditLine` correctly recalculates on field change, the Total field accepts manual input that breaks the formula

The fix is to make the Total field **read-only** (always `qty × price - discount + tax`), remove the unused `weight` variable from `updateEditLine`, and ensure the "total" field change doesn't trigger recalculation of itself.

### Changes

**`src/pages/Invoices.tsx`**:

1. **Line 409**: Remove the unused `const w = ...` line in `updateEditLine`

2. **Line 1125-1127 (Total cell)**: Replace the editable `<Input type="number">` with a **read-only** `<Input>` that shows the auto-calculated value:
   ```
   <Input value={line.total} readOnly tabIndex={-1} className="text-xs font-medium h-8 min-w-[80px] bg-muted/50 cursor-default font-mono" />
   ```
   This ensures Total always reflects Purch Qty × Purch Cost and cannot be manually overridden.

3. **Line 408**: Remove `"total"` from the recalculation trigger list (since it's now read-only, no user input will set it, but clean it up for safety)

### No other files affected
The scanner table already has these fixes applied. This brings the edit invoice table in line with it.

