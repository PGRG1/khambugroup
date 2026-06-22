# Multi-location stock counting (columns, not rows)

Switch the Count tab from one zone-per-item to one column-per-location, so the same SKU can be counted in multiple locations simultaneously. Total auto-sums across columns and writes back to `stock_count_items.counted_qty` so progress + summary tab keep working unchanged.

## 1. Migration — `stock_count_location_qtys`

New table holding one row per (count item × location):

```sql
CREATE TABLE public.stock_count_location_qtys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_item_id uuid NOT NULL REFERENCES public.stock_count_items(id) ON DELETE CASCADE,
  location_id   uuid NOT NULL REFERENCES public.stock_locations(id)    ON DELETE CASCADE,
  qty           numeric,
  counted_by    uuid REFERENCES auth.users(id),
  counted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (count_item_id, location_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_count_location_qtys TO authenticated;
GRANT ALL ON public.stock_count_location_qtys TO service_role;

ALTER TABLE public.stock_count_location_qtys ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated
-- Writes: admin or manager via has_role()
```

Plus `BEFORE UPDATE` trigger calling `public.update_updated_at_column()`.

## 2. New-count flow (inside `StockCounts.tsx`)

After the existing bulk insert of `stock_count_items`, when the user picked one or more locations in the dialog:

- Re-read the inserted items (with their `id`s).
- Build `items.length × selectedLocations.length` rows of `{count_item_id, location_id, qty: null}` and bulk-insert into `stock_count_location_qtys`.

If no locations were selected, skip — session behaves exactly as today (single Counted column).

## 3. Count tab grid (only changes when location_qtys exist)

Detect "multi-location mode" by querying `stock_count_location_qtys` for the session on load. If any row exists, use the new grid; otherwise leave the current single-input grid untouched.

New grid per category group:

```
SKU | Item | Unit | [Last count?] | Loc 1 | Loc 2 | … | Loc N | Total | Notes
```

- **Last count** column: shown only when `reference_mode !== 'none'`. Muted italic, `—` when null.
- **Location columns**: ordered by `stock_locations.sort_order`. Header = name plus a colored dot cycling teal-500 / blue-500 / purple-500 / orange-500 by index.
- **Cell input**: `<Input type="number" className="h-7 w-20 text-right text-sm" placeholder="—" />`. On blur:
  1. Upsert `stock_count_location_qtys` (`qty`, `counted_by = auth.uid()`, `counted_at = now()`) on `(count_item_id, location_id)`.
  2. Sum all non-null qtys for this item across locations.
  3. Update `stock_count_items.counted_qty` with that sum (null if every cell is null).
  4. Brief `ring-1 ring-green-500` on the input on success.
- **Total cell**: live sum of in-memory location qtys for the row; `—` if all null. `className="text-right font-semibold bg-muted/30 px-3 py-2"`.
- **Notes cell**: unchanged popover.

Wrap the table in `overflow-x-auto` with `style={{ minWidth: 600 + locations.length * 90 + "px" }}` on the inner table so horizontal scroll kicks in for many locations.

**Filter pills**: replace the current zone pills with location pills. "All zones" shows every column at full opacity. Selecting a single location applies `opacity-40` to other location column headers + cells so a counter can focus on their own column. The Total + Last count columns stay fully visible.

**Progress / Uncounted toggle / category grouping**: unchanged. An item is "counted" when `counted_qty IS NOT NULL`, which is exactly what the blur handler maintains — so progress bar, Uncounted filter, and Summary tab work without modification.

## Files touched

- `supabase/migrations/<new>.sql` — table, grants, RLS, `updated_at` trigger.
- `src/pages/procurement/StockCounts.tsx` — dialog submit (extra insert), Count tab grid only.

No other files change. List view, New Count dialog layout, Summary tab, SystemConfiguration, and routes stay as they are.
