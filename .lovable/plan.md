

## Fix: Multi-column sorting with 3-state cycle across procurement tabs

### Problem
1. Sorting only supports one column at a time — clicking a new column resets the previous sort
2. Only two states exist (asc/desc) — no way to reset/clear a column's sort
3. The "partial sorting" issue stems from single-column sort losing context when filters change

### Solution
Replace the single `sortKey`/`sortDir` state with a `sortColumns` array that supports multi-column sorting and a 3-state cycle: **ascending → descending → reset (unsorted)**.

### Files to change

**1. `src/components/procurement/ProcurementLineItemsTab.tsx`**
- Replace `sortKey`/`sortDir` with `sortColumns: Array<{key: string, dir: "asc"|"desc"}>` state
- Update `toggleSort` to cycle: unsorted → asc → desc → unsorted. If column exists, cycle its state; if not, append it
- Update sort logic in `filtered` memo to apply multi-column comparisons in order
- Update `SortIcon` to show sort priority number when multiple columns are sorted

**2. `src/components/procurement/ProductMasterTab.tsx`**
- Same refactor as above

**3. `src/components/procurement/ProcurementInvoicesTab.tsx`**
- Same refactor as above

**4. `src/components/procurement/InventoryOnHandTab.tsx`**
- Same refactor (uses `sortKey`/`sortAsc` naming but same pattern)

**5. `src/components/procurement/SuppliersTab.tsx`**
- Check and apply same refactor if sorting exists

### Implementation pattern (shared across all tabs)

```typescript
// State
const [sortColumns, setSortColumns] = useState<Array<{key: string, dir: "asc"|"desc"}>>([]);

// 3-state toggle: none → asc → desc → none
const toggleSort = (key: string) => {
  setSortColumns(prev => {
    const idx = prev.findIndex(s => s.key === key);
    if (idx === -1) return [...prev, { key, dir: "asc" }];
    if (prev[idx].dir === "asc") return prev.map((s, i) => i === idx ? { ...s, dir: "desc" } : s);
    return prev.filter((_, i) => i !== idx); // remove = reset
  });
};

// Multi-column sort
result.sort((a, b) => {
  for (const { key, dir } of sortColumns) {
    const av = (a as any)[key], bv = (b as any)[key];
    let cmp = typeof av === "number" && typeof bv === "number"
      ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
    if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
  }
  return 0;
});

// Sort icon with priority badge
const SortIcon = ({ col }: { col: string }) => {
  const entry = sortColumns.find(s => s.key === col);
  if (!entry) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
  return (
    <span className="inline-flex items-center gap-0.5">
      {entry.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {sortColumns.length > 1 && <span className="text-[9px] font-bold">{sortColumns.indexOf(entry) + 1}</span>}
    </span>
  );
};
```

### Scope
- 4-5 files, same mechanical refactor in each
- No database changes
- No new dependencies

