

## Fix: False SKU Mismatch for Valid External SKUs

### Problem
When the scanner finds a match via `internal_sku`, it then checks if the scanned `item_code` matches the `external_sku` of the **single** PM entry it resolved. But a product can have multiple supplier entries (each with its own `external_sku`). If the scanned code matches a different supplier entry under the same internal SKU, a false "SKU mismatch" is triggered.

### Fix

**`src/components/invoices/InvoiceScanner.tsx`** — lines 337-343 in `flagLineItemIssues`:

Instead of comparing the scanned code only against `pmEntry.external_sku`, check against **all** PM entries that share the same `internal_sku`. If any of them have an `external_sku` that matches the scanned code (exact, partial, or pipe-segment), it's not a mismatch.

Change the logic from:
```
const pmExtSku = pmEntry.external_sku...
const skuMatches = ... scannedCode === pmExtSku ...
```

To:
```
// Collect all external SKUs for entries sharing this internal_sku
const allExtSkus = pm
  .filter(p => p.internal_sku === workingLine.matched_sku)
  .map(p => (p.external_sku || "").trim().toLowerCase())
  .filter(Boolean);

const skuMatches = !scannedCode || allExtSkus.length === 0
  || allExtSkus.some(sku =>
    scannedCode === sku
    || sku.includes(scannedCode)
    || scannedCode.includes(sku)
    || sku.split("|").some(seg => seg.trim() === scannedCode)
  );
```

This ensures a scanned code like `144111171159` won't trigger a mismatch as long as any supplier entry under the matched internal SKU has that external SKU.

### Files Changed
- `src/components/invoices/InvoiceScanner.tsx` — one block (~5 lines)

