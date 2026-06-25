## Move "Update master" button outside !matchesInvoice condition

Pure UI change in both files. Update master should render whenever it differs from master, even if accepted equals invoice price.

### Files
- `src/components/invoices/InvoiceScanner.tsx`
- `src/components/procurement/ProcurementInvoicesTab.tsx`

### Change
Replace the three separate subtext blocks (`matchesInvoice`, `!matchesInvoice && master_price != null`, `!matchesInvoice && master_price == null`) in the Acc. price cell with a single unified subtext row:

- `= invoice price` — when `matchesInvoice`
- `Master: $X.XX` — when `master_price != null` (always, independent of match state)
- `No master price` — when `master_price == null && !matchesInvoice`
- `Update master` button — when `differsFromMaster && product_master_id` (independent of match state)

### Handler/index mapping
- Scanner: `i` / `handleUpdateMaster(i)` / `updatingMasterIdx === i`
- Procurement tab: `index` / `handleEditUpdateMaster(index)` / `updatingMasterIdx === index`

### Not touched
Input row, arrow button, `Eff:` label, free-unit branch, state/handlers/save logic.
