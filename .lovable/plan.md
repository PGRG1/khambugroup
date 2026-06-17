Add drag-and-drop file upload support to `src/components/finance/bills/BillScanner.tsx` alongside the existing "Choose files" and "Camera" buttons.

Changes:
1. Wrap the upload button area in a drop zone that handles `onDragOver`, `onDragLeave`, and `onDrop`.
2. On drop, feed `e.dataTransfer.files` into the existing `handleFiles` function — no new processing logic needed.
3. Add a `dragging` state boolean to highlight the drop zone border and background while a file is being dragged over it (e.g., dashed emerald border + subtle emerald background tint), matching the pattern already used in `InvoiceScanner.tsx`.
4. Update the drop zone text to indicate that files can be dropped: e.g., "or drag and drop files here" beneath the button row.

No backend, database, or edge function changes are required — the existing `handleFiles` and upload/scan flow stays exactly the same.

This is a single-file, UI-only change to `BillScanner.tsx`.