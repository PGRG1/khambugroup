

## Fix: Orange header band cut off mid-row

### Problem
The header `bg-primary` ends mid-row around "Recipe Qty", with the rightmost cells (Cost/Recipe, Supplier, Status) showing the cream `bg-card` underneath. The header `<div>` is sized to its grid track total, which on this layout doesn't fully extend to the scroll container's right edge — so the orange band stops short and the cream background shows through.

### Fix (`src/components/procurement/ProductMasterTab.tsx`)

**Line 467** — move the orange background up to the inner wrapper so it always paints the full header band width, regardless of how grid tracks resolve:

- From: `<div style={{ minWidth: "min(1800px, 100%)", width: "100%" }}>`
- To: add a wrapping element OR simpler — give the wrapper a top-aligned orange band via a sticky pseudo-bg.

Cleanest concrete change:
1. **Line 464**: keep scroll container `bg-card` (unchanged).
2. **Line 467**: wrap the header in its own full-width sticky band that paints `bg-primary` edge-to-edge:
   ```tsx
   <div style={{ minWidth: 1800, width: "max-content" }}>
   ```
   Changing `min(1800px, 100%)` → `1800` and `width: "100%"` → `width: "max-content"` forces the inner content (including the grid header) to size to its actual columns. Combined with the grid using `fr` units, the header div will then expand to match the wrapper, so `bg-primary` paints across the entire header row.
3. **Line 470 header div**: add `w-full` to be explicit:
   ```tsx
   className="grid bg-primary text-primary-foreground text-[12px] font-semibold sticky top-0 z-10 w-full"
   ```

### Result
- Entire header row is solid orange across all 17 columns + actions, edge to edge.
- Body rows unchanged (cream / `bg-muted/20` zebra).
- Horizontal scroll only triggers if viewport < 1800px.

