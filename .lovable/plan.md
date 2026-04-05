

## Add "Documents" Tab to Procurement

### What it does
A new **Documents** tab in the Procurement module that serves as a document management center for stored invoice files. Users can browse, filter, select, and bulk-download invoice attachments.

### Features

1. **Document listing table** showing all invoices that have attachments (`file_url IS NOT NULL`), with columns: Date, Supplier, Invoice #, Venue, Status, File(s), and a checkbox for selection.

2. **Filters**:
   - **Period**: Monthly dropdown (extracted from invoice dates, same pattern as Invoice Line Items tab)
   - **Supplier**: Dropdown of all suppliers
   - **Venue**: Dropdown of venues
   - **Status**: Dropdown (pending, verified, approved, paid, etc.)
   - **Search**: Free-text search on invoice number / supplier name

3. **Selection & Download**:
   - Checkbox per row + "Select All" header checkbox
   - **Download Selected** button: fetches signed URLs for all selected invoices' files and triggers downloads
   - **Download All (filtered)** button: downloads all files matching current filters
   - Single row download icon button for individual invoice files

4. **Download mechanism**: For each selected invoice, fetch signed URLs from the `invoice-files` bucket using `supabase.storage.from("invoice-files").createSignedUrl()`, then trigger browser downloads. Multi-file downloads happen sequentially with a short delay to avoid browser blocking.

### Technical details

**New file**: `src/components/procurement/DocumentsTab.tsx`
- Reuses `useInvoiceData` hook (already provides invoices with `file_url` and `supplier_name`)
- Filters invoices to only those with `file_url` present
- Period filter extracts unique YYYY-MM from `invoice_date` (same pattern as `ProcurementLineItemsTab`)
- Download uses `supabase.storage.from("invoice-files").createSignedUrl(path, 300)` then `window.open(url)` or anchor click
- For bulk downloads, iterate files with ~300ms delay between each

**Modified file**: `src/pages/Procurement.tsx`
- Add new tab trigger with `FolderDown` icon and "Documents" label
- Add `TabsContent` rendering `DocumentsTab`

### No database changes needed
All data already exists in the `invoices` table (`file_url`, `file_name` columns) and `invoice-files` storage bucket.

