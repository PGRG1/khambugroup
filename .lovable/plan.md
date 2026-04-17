
The user scanned a Ming Kee invoice and typed an External Name "Rose Extra Sp. Wheat Flour 50lb". The scanner auto-populated an External SKU for it, but Ming Kee invoices have no SKUs — and the Product Master entry for that product also has external_sku = "" (empty). The scanner should respect the Product Master as the source of truth: if the matched PM entry has empty external_sku, the line's External SKU must remain empty.

Likely cause in `InvoiceScanner.tsx`: when a product is matched/hydrated (via `selectProduct`, AI parse, or `flagLineItemIssues`), the code probably falls back to the typed/scanned `item_code` when the PM `external_sku` is empty, instead of forcing it to empty. Need to verify.

Let me inspect.
