
User wants drag-and-drop row reordering in the invoice scanner table — grab the row number cell (left column) and drag the row up/down to reposition it within the line items list.

## Plan: Drag-to-reorder rows in Invoice Scanner

### Goal
Let users grab any row by its row-number cell (leftmost column with `1, 2, 3...`) and drag it vertically to a new position in the line items list. Row numbers re-sequence automatically after the drop.

### Scope
- File: `src/components/invoices/InvoiceScanner.tsx` (scanner line items table only)
- Not in scope: edit-invoice dialogs, other procurement tables (can be added later if requested)

### Approach
Use HTML5 native drag-and-drop (no new dependency needed):
1. Make the row-number `<td>` the drag handle: add `draggable`, `cursor: grab`, hover styling, and a small grip icon (`GripVertical` from lucide).
2. On the `<tr>`:
   - `onDragStart` → store source index, set drag image
   - `onDragOver` → `preventDefault`, compute drop position (above/below based on mouse Y vs row midpoint), show visual indicator (top/bottom border highlight)
   - `onDragLeave` → clear indicator
   - `onDrop` → splice the line item from source index to target index, update state, clear indicator
   - `onDragEnd` → cleanup
3. Reorder mutates the existing `lineItems` state array (immutable update). Row numbers come from index, so they re-sequence automatically.
4. Preserve all per-row state (matched product, edits, errors).

### Visual cues
- Row-number cell shows grip icon on hover, `cursor: grab` (→ `grabbing` while dragging)
- Dragging row: `opacity-50`
- Drop target row: 2px terracotta border on top or bottom edge depending on drop position

### Verification
1. Open Invoice Scanner with multiple parsed lines
2. Hover row #5's number cell → grip icon + grab cursor
3. Drag row #5 above row #2 → row lands at position 2, row numbers re-sequence 1..N
4. Drag to bottom → lands last
5. Confirm matched product / qty / price / errors stay attached to the moved row
6. Confirm save still writes lines in the new visual order
