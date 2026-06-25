In both `src/components/invoices/InvoiceScanner.tsx` and `src/components/procurement/ProcurementInvoicesTab.tsx`, update the accepted price cell:

1. **`master_price != null` branch**: Replace the static `Master: $X.XX` span with two clickable chips ("Master $X.XX" and "Inv $X.XX") that fill the accepted price input on click. Keep the "Update master → $X" button below them and the `Eff: $X` line untouched.
2. **`master_price == null` branch**: Replace `No master price` span with a single "Inv $X.XX" chip that fills the input.

InvoiceScanner uses `updateLineAcceptedPrice(i, value)`; ProcurementInvoicesTab uses `updateEditLineAcceptedPrice(index, value)` and `handleEditUpdateMaster`. No state/logic/save changes.