

## Plan: In-App Attachment Viewer Dialog

### Problem
Currently, clicking "View" opens each attachment page in a separate browser tab. Multi-page invoices only show the first page (popup blockers), and the experience is fragmented.

### Solution
Create a shared `AttachmentViewer` dialog component that opens a single popup with all pages stacked vertically in a scrollable view. This replaces all `window.open` calls for invoice attachments.

### Component: `src/components/invoices/AttachmentViewerDialog.tsx`
- A `Dialog` that accepts `open`, `onOpenChange`, `fileUrl` (comma-separated paths), and `invoiceNumber` (for the title).
- On open, splits `fileUrl` by comma, fetches signed URLs for each path in parallel from the `invoice-files` bucket.
- Renders all signed URLs as `<img>` tags (for images) or `<iframe>` (for PDFs) stacked vertically inside a `ScrollArea`.
- Shows a loading spinner while URLs are being fetched.
- Each page gets a small "Page X of Y" label above it.
- Clean minimal design with a max-width dialog, full-height scroll.

### Integration Points (3 files)
1. **`ProcurementInvoicesTab.tsx`**:
   - Replace the `openFile` function and the per-page `Button` list in the detail drawer with a single "View Attachments" button that opens the dialog.
   - Replace the `ExternalLink` icon button in the table row to also open the dialog instead of `window.open`.

2. **`Invoices.tsx`**:
   - Replace the audit docs "View" button (line ~619-626) to open the dialog.
   - Replace the detail drawer attachment buttons (line ~716-727) to open the dialog.

3. **State**: Add `attachmentViewerOpen`, `attachmentViewerUrl`, and `attachmentViewerInvoiceNumber` state in both parent components.

### Technical Details
- Signed URLs fetched via `supabase.storage.from("invoice-files").createSignedUrl(path, 3600)`.
- Detect file type from path extension: `.pdf` renders as `<iframe>`, images render as `<img>`.
- Dialog uses `max-w-4xl` and `max-h-[85vh]` with internal scroll for the continuous document feel.
- Images render at `width: 100%` to fill the dialog width for easy reading.

