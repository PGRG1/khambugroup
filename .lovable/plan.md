
# Sales Data Page Overhaul

All new queries scope to the active tenant via `useActiveTenant()` / `tenantSelect` — never rely on RLS alone. `AccountingMappingSummary` internals stay untouched.

## Pre-flight verification (already done)

- `sales_records.date` is `text`; **all 547 rows** match `^\d{4}-\d{2}-\d{2}$`. Month bucketing via `date.slice(0, 7)` is safe today.
- Even so, month bucketing goes through one helper `monthKey(dateStr)` in `src/utils/format.ts`: returns `dateStr.slice(0,7)` when the regex matches, else `new Date(dateStr).toISOString().slice(0,7)`, else `"unknown"` (records with `"unknown"` are grouped last under an "Unknown date" header so nothing silently disappears). Single source of truth for the group + subtotal logic.

## 1. Record ID (foundational)

**`src/types/sales.ts`** — add `id: string` to `SalesRecord`.

**`src/hooks/useSalesData.ts`**
- `fromDbRecord`: include `id: r.id`.
- `toDbRecord`: unchanged (no id on insert).
- `updateRecord(old, next)`: `.eq("tenant_id", tenantId).eq("id", old.id)`.
- `deleteRecord(rec)`: `.eq("tenant_id", tenantId).eq("id", rec.id)`.
- `attachReceipt`: switch match to `id`.
- Add `getRecordById(id)`: check cached `data` first; fallback tenant-scoped Supabase fetch `.eq("id", id).eq("tenant_id", tenantId).maybeSingle()`.

Thread `id` through `DataTable` row keys and the new detail route.

## 2. `DataPage.tsx` button styling

- "Upload Data" → primary filled.
- "Manual Entry" & "Scan Receipt" → secondary outlined.
- No behavior change.

## 3. `DataTable.tsx` — filters, grouping, URL state

### Remove
- Venue entry from ExcelFilterPopover column list (header loses filter icon).
- Any `columnFilters["venue"]` read/write.
- 25-per-page pagination.
- Internal `SalesDetailModal` state.

### Add
- **DateFilter** in toolbar between venue pills and search. AND-combined with all other filters.
- **`NumericRangeFilterPopover`** (new small component) for orders, guests, subtotal, serviceCharge, discount, totalSales. State `{ min?: number; max?: number }`; empty=unfiltered, only min=`≥`, only max=`≤`, both=inclusive. Day keeps the checkbox popover.
- **`uniqueValues`** recomputed against the dataset with all *other* active filters applied (excluding the column itself), live.
- **Active filter chip strip** above the table, only when any filter is active. One removable pill per active filter with a short label; "Clear all" resets state and clears the query string.
- **Reconciliation banner** above chips (only when `mismatchCount > 0` or `unmappedCount > 0`; show only the relevant half if one is zero):
  - Left half click → sets `recon=1` in URL, filters view to mismatched rows.
  - Right half click → `navigate("/finance/chart-of-accounts")`.
  - `unmappedCount` sourced from a new tiny hook `useUnmappedVenues()` that reuses the exact lookup rules already in `AccountingMappingSummary` (does not mutate that file).
- **Month grouping** using `monthKey()`:
  - Group filtered+sorted rows by month, most recent first.
  - Collapsible header: chevron, `"May 2026"`, record count.
  - Bold subtotal row summing orders, guests, subtotal, serviceCharge, discount, totalSales.
  - Current month expanded; others collapsed. Collapsed months **do not render** inner rows or subtotal (conditional render, not CSS).
  - Months with zero matching records are not rendered.
  - Row click (outside receipt eye) → `navigate("/sales-data/" + row.id)`.
- **Cell styling**: `discount < 0` → destructive; `totalSales` on mismatched rows → destructive (kept); numeric cell equal to 0 → `text-muted-foreground`.
- **"Mapping" text button** next to CSV export → opens Dialog wrapping `<AccountingMappingSummary />`.
- **CSV export**: non-blocking `toast()` stating record count + short active-filter summary, then immediate download.

### URL-sync spec (concrete, not a hand-wave)

Single source of truth is React component state. URL is a *projection* of state, and the URL is only read once on initial mount. Loop is broken structurally, not with heuristics.

```text
mount:
  read searchParams once → hydrate state (initialFromUrl)

on every state change:
  next = buildParams(state)          // deterministic serializer
  if next.toString() !== currentSearchParams.toString():
    setSearchParams(next, { replace: true })

on searchParams change:
  no-op   ← we do NOT re-derive state from the URL after mount
           (browser back/forward for this page is out of scope;
            the detail route handles its own back navigation)
```

Keys: `venue`, `from`, `to`, `q`, `sort`, `dir`, `d_<col>` (CSV of checked values), `n_<col>` (`min:max`, either side may be empty), `recon`.

The equality check on serialized strings guarantees no feedback loop even if React double-renders. No `useRef` sentinel needed; the guard is that we never listen to `searchParams` after mount.

## 4. Remove `AccountingMappingSummary` from `DataPage.tsx`

Delete the always-visible render. Access is now only via the "Mapping" dialog in the toolbar.

## 5. Detail route `/sales-data/:id`

**New `src/pages/SalesRecordDetail.tsx`**
- `useParams<{ id: string }>()`, `useActiveTenant()`, `useSalesData()`.
- Fetch via `getRecordById(id)` (tenant-scoped fallback). If not found → "Record not found" + back button.
- Full-page layout mirroring `SalesDetailModal` sections (General / Sales Breakdown / Payment Methods / totals & mismatch banners).
- Inline Edit → `updateRecord`, stay on page, `toast.success("Record updated")`.
- Delete → confirm dialog → `deleteRecord`, `navigate("/sales-data")`, toast.
- Receipt view/attach preserved.

**`src/App.tsx`** — route `/sales-data/:id` → `SalesRecordDetail` inside the same auth/layout wrapper as `/sales-data`.

**`DataTable.tsx`** — remove modal usage; row click uses `useNavigate()`.

## 6. Multi-tenancy audit

Every new Supabase read (`getRecordById`, `useUnmappedVenues`) explicitly filters by `tenant_id` in addition to any other key.
