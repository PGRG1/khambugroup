

## Fix: Single scroll area + responsive width on Product Master

### Two problems
1. **Two disconnected scrollbars** — Horizontal scroll lives on the **outer** wrapper (`overflow-x-auto` at line 462), but vertical scroll lives on the **inner body** (`overflow-y-auto` at line 485). They scroll independent containers, so the header/body shift horizontally while the body alone scrolls vertically — feels like "two tables".
2. **Fixed 1800px width on a 3220px screen** — The inner `<div style={{ minWidth: 1800 }}>` (line 463) forces horizontal scroll even when the viewport has plenty of room. The grid columns (line 378) sum to ~1700px of fixed widths plus two `minmax(180px,1.4fr)` flex columns — but the flex columns can't expand because `minWidth: 1800` is the cap.

### The fix (in `src/components/procurement/ProductMasterTab.tsx`)

**Change 1 — make the table container the single scroll owner (both axes):**
- Line 462: `<div className="overflow-x-auto">` → `<div ref={scrollRef} className="overflow-auto" style={{ height: "calc(100vh - 340px)", minHeight: 420 }}>`
- This single div now handles BOTH horizontal and vertical scroll, so header + body move together horizontally and there's only one scrollbar pair.

**Change 2 — drop the inner body scroll wrapper:**
- Lines 483-487: Remove the inner `<div ref={scrollRef} className="overflow-y-auto overflow-x-hidden" style={{ height: ... }}>`. The virtualizer's `scrollRef` moves up to the outer container (Change 1).
- Keep the inner `<div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>` for the absolute-positioned virtual rows.

**Change 3 — make width responsive:**
- Line 463: `<div style={{ minWidth: 1800 }}>` → `<div style={{ minWidth: "min(1800px, 100%)", width: "100%" }}>`
- On wide screens (≥1800px viewport like the user's 3220px), the table fills the available width and the two `minmax(180px,1.4fr)` product-name columns expand to absorb the extra space — no horizontal scroll.
- On narrow screens (<1800px), `minWidth` kicks in and horizontal scroll appears on the single outer container.

**Change 4 — sticky header inside the new scroll container:**
- The header div (line 465) already has `sticky top-0 z-10` — it will continue to stick to the top of the now-outer scroll container, which is exactly the Invoice Line Items pattern.

### Files touched
- `src/components/procurement/ProductMasterTab.tsx` (4 small changes in lines 461-487)

### Result
- One scrollbar on the right (vertical) when content overflows vertically.
- One scrollbar on the bottom (horizontal) **only when viewport < ~1800px**. On the user's 3220px screen, no horizontal scroll at all — the product-name columns flex to fill.
- Header stays pinned and moves in lockstep with body horizontally.

