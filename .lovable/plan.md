## Goal

Allow attaching a receipt file to sales records (both at creation and retroactively), and surface a quick "view receipt" icon directly in the Sales Data table row.

## Changes

### 1. Manual Input form (`src/components/dashboard/ManualInput.tsx`)
- Add an optional file input ("Attach receipt — image or PDF") below the form fields.
- Pass the selected `File` to `onAdd` alongside the record.
- Update `DataPage` so the manual-input `onAdd` callback forwards the file to `addRecord(record, file)` (already supports the `file` parameter).

### 2. Sales Detail modal (`src/components/dashboard/SalesDetailModal.tsx`)
- When a record has **no** `receiptFileUrl`: show an "Attach receipt" button (paperclip icon) that opens a hidden file picker.
- When a record **has** a receipt: keep the existing eye icon, plus add a "Replace" option in edit mode.
- On upload: call a new `onAttachReceipt(record, file)` prop wired through `DataPage` → `useSalesData`.

### 3. New hook method (`src/hooks/useSalesData.ts`)
- Add `attachReceipt(record, file)`:
  - Upload to `sales-receipts` bucket using the same path convention as `addRecord`.
  - If the record already had a receipt, delete the old file from storage first.
  - Update the row's `receipt_file_url` / `receipt_file_name` columns matched by `(date, venue, report_number)`.
  - Log audit event `attach_receipt`.
  - Refetch.

### 4. Eye icon in Sales Data table (`src/components/dashboard/DataTable.tsx`)
- Add a leading narrow column (no header label) showing an `Eye` icon for rows where `receiptFileUrl` is set.
- Clicking the icon opens `AttachmentViewerDialog` directly (bucket=`sales-receipts`) without opening the row's detail modal — `stopPropagation` on the click.
- Rows without a receipt show empty space in that column.

### 5. No DB migration needed
The `sales_records.receipt_file_url` / `receipt_file_name` columns and the `sales-receipts` bucket already exist from the previous change.

## Out of scope
- Bulk Excel upload attachments
- Multi-file attachments per record (single file only, replace on re-upload)
