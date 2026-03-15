

## Plan: Clean Up Orphaned Invoice Files from Storage

### Problem
When invoices were previously deleted from the database, their associated files in the `invoice-files` storage bucket were not removed. There are ~130+ files in storage but only 6 are referenced by active invoices.

### Referenced files (to keep)
- `2025-05-19/1536879.jpg`
- `2025-05-26/1537473.jpg`
- `2025-06-03/1538091.jpg`
- `2025-07-08/SI25070156.jpg`
- `2025-07-10/SI25070199.jpg`
- `2025-08-14/SI25080288.jpg`

### Solution (2 parts)

**1. One-time cleanup: Delete orphaned storage files**

Create a backend function that:
- Lists all objects in the `invoice-files` bucket
- Compares against `invoices.file_url` values
- Deletes any file not referenced by an active invoice

This must be done via an edge function since storage file deletion requires the Storage Admin API (cannot be done via SQL `DELETE FROM storage.objects` safely).

**2. Prevent future orphans: Update delete logic in code**

Modify `useInvoiceData.ts` `deleteInvoice` function to also delete the associated file from storage before removing the database record. Currently it only deletes the DB rows.

### Changes

**New edge function: `supabase/functions/cleanup-storage/index.ts`**
- Accepts POST with `{ bucket: "invoice-files" }`
- Uses service role to list all files in the bucket
- Queries `invoices` table for all `file_url` values
- Deletes any file not in the referenced set
- Returns count of deleted files

**`src/hooks/useInvoiceData.ts`** — `deleteInvoice` function
- Before deleting the DB record, check if the invoice has a `file_url`
- If so, call `supabase.storage.from('invoice-files').remove([file_url])` to delete the file
- Then proceed with the existing DB deletion

