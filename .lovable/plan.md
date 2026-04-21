
## Change

Update the virtualization overscan/render target from ~30 visible rows to **100 rows** rendered (visible + buffer) in the Invoice Line Items virtualization plan.

### Files affected (same as prior plan)
- `src/components/procurement/ProcurementLineItemsTab.tsx`
- `src/components/procurement/ProcurementInvoicesTab.tsx`
- `src/components/invoices/LineItemsTab.tsx`
- `package.json` — add `@tanstack/react-virtual`

### Virtualization config
- Use `useVirtualizer` with:
  - `count: filtered.length`
  - `estimateSize: () => 36` (row height in px, matches current compact row)
  - `overscan: 100` — ensures ~100 rows are kept in the DOM around the viewport instead of the default ~10
- Scroll container: fixed height `h-[calc(100vh-280px)]` with sticky `<thead>` and sticky footer total row.

### Everything else from the prior plan stays the same
- Default `monthFilter` to the latest month present in the data
- Debounce realtime refetches to 300 ms; refetch only `invoice_line_items` (cache suppliers/products/invoices from initial load)
- Pre-lowercase searchable fields once in the row mapping for snappier search
- Sorting, CSV download, and the eye-icon attachment viewer remain unchanged

### Expected result
- Initial paint: ~400-700 ms (down from 3-5 s)
- ~100 rows kept in DOM at any time → smoother scroll with fewer paint pops at fast-scroll boundaries than a 30-row buffer
- Search/filter keystrokes stay snappy

### Verification
1. Open `/procurement/line-items` — loads in under 1 s, defaults to latest month.
2. Scroll fast through "All Months" — no blank rows appear at the edges (100-row buffer covers it).
3. Sort, search, CSV export, and attachment viewer all still work.
4. Upload a new invoice → Line Items refreshes within ~500 ms with a single refetch.
