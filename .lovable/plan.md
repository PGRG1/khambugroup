

## Fix: Product Selection Should Always Update Both External SKU and External Name

### Problem
When selecting a product from the autocomplete dropdown (whether searching by External SKU or External Name), the External SKU (`item_code`) field only updates if the product's supplier matches the invoice supplier. This means picking a product from the dropdown can leave the External SKU unchanged, showing stale or incorrect data.

The user expects: **selecting any product from the dropdown should always fill both the External SKU and the External Name fields** from the selected product.

### Root Cause
Both `selectEditProduct` (ProcurementInvoicesTab.tsx line 435) and `selectProduct` (InvoiceScanner.tsx line 586) have this conditional:
```
item_code: supplierMatch ? (product.external_sku || currentLine.item_code) : currentLine.item_code
```
When the supplier doesn't match, the `item_code` keeps its old value instead of updating from the selected product.

### Fix
Change both functions to **always** set `item_code` from the selected product's `external_sku`:

**`src/components/procurement/ProcurementInvoicesTab.tsx`** (line 435):
- Change to: `item_code: product.external_sku || currentLine.item_code`
- Remove the `supplierMatch` conditional for `item_code`

**`src/components/invoices/InvoiceScanner.tsx`** (line 586):
- Same change: `item_code: product.external_sku || lines[i].item_code`
- Remove the `productSupplierMatch` conditional for `item_code`

### Files Changed
- `src/components/procurement/ProcurementInvoicesTab.tsx` — 1 line
- `src/components/invoices/InvoiceScanner.tsx` — 1 line

