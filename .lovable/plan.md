
## Fix: Make supplier-specific blank External SKU stay blank

### Root cause
The scanner is still getting `1320001` because the Product Master is flattened with the wrong fallback logic.

In multiple places, supplier entries are built like this:

```ts
external_sku: s.external_sku || p.external_sku || ""
```

So if the Ming Kee `product_suppliers.external_sku` is intentionally empty, the code falls back to the legacy/shared `product_master.external_sku` and incorrectly shows `1320001`.

That means the PM reference is not actually supplier-authoritative yet.

### What to change
Update all Product Master flattening/hydration paths so that:

- if a `product_suppliers` row exists for that supplier, use its `external_sku` exactly as stored
- do not fall back to `product_master.external_sku` for supplier rows
- only use `product_master.external_sku` when there is no supplier row at all

### Files to update
1. `src/components/procurement/ProcurementInvoicesTab.tsx`
   - change PM flattening at load time
   - likely also fix `selectEditProduct` so it never preserves the old scanned SKU when PM SKU is blank

2. `src/pages/Invoices.tsx`
   - change `loadProductMaster()` flattening
   - change `openEdit()` supplier hydration if needed
   - change `selectEditProduct()` to force `item_code = product.external_sku || ""`

3. `src/components/invoices/InvoiceScanner.tsx`
   - verify all selection/hydration paths already force PM SKU
   - if needed, remove any remaining fallback to current/scanned code after a product is selected

### Expected behavior after fix
For Ming Kee:
- selecting `Rose Extra Sp. Wheat Flour 50lb` keeps External SKU empty
- no scanned SKU like `1320001` should be re-inserted
- Product Master remains the source of truth per supplier

For suppliers that do use SKUs:
- selecting a matched product still fills the correct supplier-specific SKU

### Verification
1. Open scanner on a Ming Kee invoice
2. Select External Name `Rose Extra Sp. Wheat Flour 50lb`
3. Confirm External SKU stays blank
4. Repeat in both:
   - scanner flow
   - invoice edit flow
5. Confirm another supplier with a real SKU still auto-fills correctly

### Technical note
This is a data-shaping bug, not a matching bug. The resolver can only return what the flattened Product Master gives it. The fix is to stop leaking shared/legacy `product_master.external_sku` into supplier-specific entries.
