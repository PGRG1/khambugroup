## Goal

When a user scans a sales receipt, save the original file (image/PDF) to storage and link it to the resulting sales record so it can be viewed later — similar to how invoice attachments work.

## Changes

### 1. Storage bucket
Create a new private storage bucket `sales-receipts` with RLS policies:
- Authenticated users can read
- Admins/managers can insert/update/delete

### 2. Database — `sales_records` table
Add two nullable columns:
- `receipt_file_url` (text) — storage path
- `receipt_file_name` (text) — original filename

### 3. Receipt scanning flow (`ReceiptScanner.tsx`)
- Keep the original `File` object in state after scanning
- On Save: upload the file to `sales-receipts/{date}_{venue}_{reportNumber}.{ext}` before/after saving the record
- Pass the file URL + name through to the save handler

### 4. Wire-through
- `useSalesData.addRecord` accepts an optional `file` parameter; uploads to bucket, then includes `receipt_file_url` / `receipt_file_name` in the insert
- `DataPage` passes file from scanner to `addRecord`
- `SalesRecord` type gets optional `receiptFileUrl` / `receiptFileName`

### 5. View attachment
- In the Sales Data table (`DataTable` / `SalesDetailModal`), show a small "View receipt" eye icon when a record has a `receipt_file_url`, opening it via a signed URL (reuse `AttachmentViewerDialog` pattern from invoices)

### 6. Manual entry
Manual entries won't have a file — the columns remain nullable, no UI change needed there.

## Out of scope
- Bulk Excel uploads (no per-row receipt)
- Backfilling old records
