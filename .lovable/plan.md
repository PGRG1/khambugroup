

## Problem

Products added via the earlier bulk insert (FRU-0007 through VEG-0005) are missing `product_suppliers` entries. The autocomplete dropdown falls back to showing internal SKU and internal product name when `external_sku` and `supplier_product_name` are empty, which is the expected fallback behavior in the code.

## Solution

Insert the missing `product_suppliers` rows for all 8 bulk-inserted products so the dropdown displays the correct external/supplier data.

### Database Insert

Insert `product_suppliers` entries for all products that currently lack them, using the supplier data originally provided:

| Internal SKU | Supplier | External SKU | Supplier Product Name | Purchase Unit | Purchase Unit Cost |
|---|---|---|---|---|---|
| JUI-0002 | Green Valley | (empty) | Fresh Lemon Juice (per Litre) | LITRE | 65.00 |
| FRU-0007 | Green Valley | (empty) | Passionfruit (per Pc) | PCS | 4.50 |
| FRU-0008 | Green Valley | (empty) | Green Apple (per pc) | PCS | 5.50 |
| FRU-0009 | Green Valley | (empty) | Red Apple (per pc) | PCS | 5.50 |
| FRU-0010 | Green Valley | (empty) | Pineapple (Per pc) | PCS | 30.00 |
| FRU-0011 | Green Valley | (empty) | Red Dragon fruit (per pc) | PCS | 18.00 |
| FRU-0012 | Green Valley | (empty) | Sunkist Lemon per pc | PCS | 4.20 |
| VEG-0005 | Green Valley | (empty) | Pineapple Leaf 1pc | PCS | 0.00 |

This will make the autocomplete show supplier product names (e.g., "Pineapple (Per pc)") instead of internal names (e.g., "Pineapple").

No code changes needed -- the existing fallback logic (`p.supplier_product_name || p.internal_product_name`) will automatically pick up the supplier names once the data exists.

