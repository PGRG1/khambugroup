

## Add attachment link to Invoice Line Items tab

### Problem
The Line Items tab shows invoice data but has no way to view the scanned attachment. The Invoices tab already has an eye icon button that opens `AttachmentViewerDialog` — we need the same in Line Items.

### Changes

**File: `src/components/invoices/LineItemsTab.tsx`**

1. **Fetch `file_url` from invoices query** — change the select from `"id, invoice_number, supplier_id, invoice_date"` to also include `file_url`.

2. **Add `file_url` to `LineItemRow` interface** and populate it from the invoice map during mapping.

3. **Add a new first column** with an eye icon button (using `Eye` from lucide-react). Only show the icon if `file_url` is non-empty. Clicking opens the `AttachmentViewerDialog`.

4. **Add state** for `viewerOpen`, `viewerFileUrl`, `viewerTitle` and render `AttachmentViewerDialog` at the bottom of the component.

5. **Import** `AttachmentViewerDialog` and the `Eye` icon.

The eye icon column will be non-sortable and appear as the first column, matching the pattern used in the Invoices tab.

