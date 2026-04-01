

## Fix: ProductAutocomplete dropdown showing External SKUs from wrong suppliers

### Problem
The ProductAutocomplete dropdown displays the `external_sku` (orange code) for every product entry, even when that SKU belongs to a different supplier. For example, when scanning a Ming Kee invoice, Bleach Liquid shows ONGO's external SKU in the dropdown. The selection logic already prevents incorrect assignment, but the **display** is misleading.

### Solution
Pass the current invoice supplier name into `ProductAutocomplete` and only display the `external_sku` in the dropdown when it belongs to the matching supplier.

### Changes

**File: `src/components/invoices/ProductAutocomplete.tsx`**
- Add optional `currentSupplier?: string` prop
- In the dropdown rendering (line 135), only show `p.external_sku` if `currentSupplier` is not set OR if `p.supplier` matches `currentSupplier` (using normalized comparison)
- Add a `normalizeSupplierName` helper (same logic used elsewhere)

**File: `src/components/invoices/InvoiceScanner.tsx`**
- Pass `currentSupplier={current.supplier_name}` to both ProductAutocomplete instances (lines ~1101-1122)

**File: `src/components/procurement/ProcurementInvoicesTab.tsx`**
- Pass `currentSupplier` (from the editing invoice's supplier name) to ProductAutocomplete instances in the edit view

### Technical notes
- No database changes needed
- The `selectProduct` guard logic remains as a safety net, but the dropdown will no longer confuse users by showing irrelevant SKUs

