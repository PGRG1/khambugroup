

## Fix: Single horizontal scrollbar on Product Master

### Problem
The table currently has two horizontal scrollbars stacked at the bottom:
1. Outer wrapper `<div className="overflow-x-auto">` (handles horizontal scroll for the wide 1700px grid)
2. Inner virtualized body `<div className="overflow-auto">` (also produces a horizontal scrollbar because the inner content is the full 1700px wide)

Both scroll horizontally → two visible scrollbars.

### Change (1 line in `src/components/procurement/ProductMasterTab.tsx`)

Change the inner body container at line 485 from:
```
className="overflow-auto"
```
to:
```
className="overflow-y-auto overflow-x-hidden"
```

This keeps vertical scrolling inside the virtualized body (so the sticky header stays visible) while letting only the **outer** wrapper handle horizontal scrolling — matching the single-scrollbar behavior the user expects (and the same pattern visually used by Invoice Line Items).

### Why this is the right fix
- The sticky header and body share the same `minWidth: 1700` container, so horizontal scroll on the outer wrapper moves them together correctly.
- Vertical scroll must stay on the inner body so virtualization works and the header stays sticky.
- No layout, sizing, or virtualization logic changes.

### Files touched
- `src/components/procurement/ProductMasterTab.tsx` (one className change)

