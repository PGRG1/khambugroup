

## Update Suppliers Master Data

### Current State
There are 32 supplier records with many duplicates (OCR variants, Chinese names, typos). These need to be consolidated to exactly 15 canonical suppliers.

### Mapping (Current → Canonical)

| Canonical Name | Current Variants to Merge |
|---|---|
| Angliss HK Food Service | Angliss HK Food Service LTD |
| Beverage World HK | *(already correct)* |
| Fountain Food Products | Fountain Food Products LTD, FOUNTAIN FOOD PRODUCTS LTD., FOUNTAIN FOOD PRODUCTS LTD. 甘泉食品有限公司, 甘泉食品有限公司 |
| Global Fine Foods | Global Fine Foods Limited |
| Green Valley HK | Green Valley |
| Lovecraft Ltd | H.K. Lovecraft Limited |
| Indian Food Marts | Indian Food Marts Limited |
| Ming Kee Seafood | *(already correct)* |
| Normex Group | Normex Group Limited |
| SAISON Food Service | SAISON Food Service LIMITED, + 4 Chinese variants |
| Telford International Company | Telford International Company Limited, + 7 variants with Chinese/typos |
| Toyo Paper | Toyo Paper Mfy.LTD. |
| VegFresh HK | *(already correct)* |
| Vintage Wines & Spirits | Vintage Wines & Spirits Limited |
| ONGO Food Ltd | 安高食材有限公司 ONGO FOOD LIMITED, 安高食財有限公司 ONGO FOOD LIMITED |

### Steps

1. **Pick one canonical supplier ID per group** -- keep the one with invoices, rename it to the canonical name
2. **Reassign invoices** -- UPDATE `invoices.supplier_id` from duplicate IDs to the canonical ID
3. **Update product_master.supplier** -- UPDATE the text field to canonical name
4. **Update product_suppliers.supplier** -- UPDATE the text field to canonical name
5. **Delete duplicate supplier rows** -- remove all non-canonical supplier records
6. **No code changes needed** -- this is purely a data cleanup task

### Technical Details

All operations are data updates (UPDATE/DELETE on existing rows), executed via the insert tool. No schema migrations required. The supplier field in `product_master` and `product_suppliers` is a text field, so we update the string values directly. The `invoices` table uses `supplier_id` (UUID FK), so we reassign to the canonical UUID.

