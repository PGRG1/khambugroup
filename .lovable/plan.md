

# Plan: Redesign TimeGridPicker for Better UX

## Issues to Fix

1. **Layout**: The time grid takes up too much vertical space while being cramped. Rearrange so the drag grid is taller and time labels are on the side.
2. **Cursor**: Currently shows `cursor-crosshair` — should show `cursor-cell` (plus sign) on hover, matching Outlook calendar behavior.
3. **Smooth dragging**: Current implementation uses slot-based snapping with `setPointerCapture`. Need to make the selection feel fluid with immediate visual feedback during drag (no lag), similar to Outlook's calendar drag-select.

## Changes

### `src/components/hr/TimeGridPicker.tsx` — Full rewrite of layout and interaction

**Layout restructure:**
- Move Start/End dropdowns to sit **side by side above** the grid (compact row)
- Make the grid container **much taller** (fill available modal space, ~450px) so users see more hours at once
- Time labels on the **left rail** (already there, keep it)
- Selected time range summary on the **right side** of the header

**Cursor fix:**
- Change `cursor-crosshair` to a custom CSS class or `cursor-cell` for the grid area
- This gives the "+" cursor that Outlook uses

**Smooth drag interaction (Outlook-style):**
- Use `requestAnimationFrame` for pointer move updates instead of direct state sets — reduces re-render jank
- Apply selection highlight via CSS `will-change: transform` for GPU-accelerated rendering
- Use a single absolute-positioned div for the selection overlay (calculated from `selStart` to `selEnd`) instead of per-slot conditional rendering — significantly reduces DOM updates during drag
- Keep `setPointerCapture` for reliable tracking outside the container
- Add `onPointerCancel` handler for edge cases
- Reduce SLOT_HEIGHT to 18px but increase container height to show more slots

### `src/components/hr/AttendanceTab.tsx` — Minor

- No changes needed; the TimeGridPicker props stay the same

## Files

| File | Action |
|------|--------|
| `src/components/hr/TimeGridPicker.tsx` | **Rewrite** — new layout, cursor fix, smooth drag |

