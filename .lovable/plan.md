

## Fix: Remove orange bleed from table body

### Problem
The scroll container has `bg-primary` (orange), which I added so the scrollbar gutter matched the header. But it bleeds through everywhere the body doesn't paint: the area past the last row, the scrollbar gutter, and any sub-pixel gaps between rows. Result: the body looks orange-tinted instead of the original cream/white.

### Fix (one line in `src/components/procurement/ProductMasterTab.tsx`)

**Line 464**: Remove `bg-primary` from the scroll container.
- From: `className="overflow-auto bg-primary"`
- To: `className="overflow-auto bg-card"`

The header (line 470) keeps its own `bg-primary` — so only the sticky header row stays orange. The body returns to the original cream background with `bg-card` / `bg-muted/20` zebra striping, exactly as before.

### Result
- Header row: fully orange (sticky, spans full width).
- Body rows: original alternating cream/white.
- Empty space below rows + scrollbar gutter: cream (matches `card-glass`), not orange.

