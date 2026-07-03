## Scope
Database migration only — add a trigger to `sales_records` so `venue_id` is always populated server-side, plus a one-time backfill for any rows currently sitting with `venue_id IS NULL`. No frontend changes.

## Why
`sales_records.venue_id` was only backfilled once, historically. No trigger exists to populate it on new inserts (confirmed against the current migration history — the existing `cascade_venue_rename` trigger only fires when a venue is renamed, not on sales inserts). Every insert path (Manual Input, bulk upload, future APIs) writes only the text `venue` column. Since `useRevenueTargetActuals` filters strictly by `venue_id`, any post-backfill rows with `venue_id = NULL` are silently excluded from every Revenue Targets "Actual" figure.

## Migration

Guard `OLD` behind `TG_OP` so the same function works for both INSERT and UPDATE without Postgres complaining:

```sql
CREATE OR REPLACE FUNCTION public.sync_sales_records_venue_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.venue IS NOT NULL AND NEW.venue_id IS NULL THEN
      SELECT id INTO NEW.venue_id FROM public.venues WHERE name = NEW.venue LIMIT 1;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.venue IS NOT NULL
       AND (NEW.venue_id IS NULL OR NEW.venue IS DISTINCT FROM OLD.venue) THEN
      SELECT id INTO NEW.venue_id FROM public.venues WHERE name = NEW.venue LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sales_records_venue_id ON public.sales_records;
CREATE TRIGGER trg_sync_sales_records_venue_id
  BEFORE INSERT OR UPDATE ON public.sales_records
  FOR EACH ROW EXECUTE FUNCTION public.sync_sales_records_venue_id();

-- One-time backfill for rows inserted after the original backfill
UPDATE public.sales_records sr
SET venue_id = v.id
FROM public.venues v
WHERE v.name = sr.venue AND sr.venue_id IS NULL;
```

No RLS/GRANT changes — trigger is `SECURITY DEFINER` and reads `public.venues`, which is already accessible to authenticated roles.

## Non-goals
- No changes to `sales_records` columns, indexes, or the existing `cascade_venue_rename` behavior.
- No client-side changes; the fix is intentionally server-side so every insert path is covered uniformly.

## Verification
1. Insert a new sales record via Manual Input for any venue → confirm `venue_id` is populated (query `sales_records` right after).
2. Re-run the backfill query → should report `UPDATE 0` (proves the trigger handles new rows going forward).
3. On the Revenue Targets page, a venue/date you just entered sales for now shows a real "Actual Revenue" instead of "—".
