

## Plan: Extract Returned Empty Kegs as Negative Line Items

### Problem
Telford invoices have a "Returned / Empty KEG" section at the bottom listing returned kegs (e.g., ASAHI 10L ×1, ASAHI 20L ×1, PERONI 19L ×8). These are deposit refunds and should appear as negative-value line items. The deposit products already exist in the Product Master (DEP-0003 through DEP-0006, each $50).

### Implementation

**Single file change: `supabase/functions/parse-invoice/index.ts`**

Add instructions to the AI system prompt (around line 98-109, in the Rules section) telling it to:

1. Look for "Returned" / "Empty KEG" / "收回" sections on invoices (typically at the bottom)
2. Extract each returned keg type and its quantity as additional line items
3. Set `quantity` as a **negative** number (e.g., -8 for 8 returned Peroni kegs)
4. Set `unit_price` to the deposit value (50 per keg, which will come from Product Master matching)
5. Set `total` as `quantity × unit_price` (negative total)
6. Use the description matching the deposit product names (e.g., "ASAHI SUPER DRY KEG (EMPTY) DEPOSIT - 20L")
7. Match these to the DEP-xxxx SKUs in the Product Master

The prompt addition will be something like:
```
- RETURNED/EMPTY KEGS: Look for sections labeled "Returned 收回", "Empty KEG 酒桶", or similar at the bottom of invoices. These list returned empty kegs (e.g., ASAHI 10L, ASAHI 20L, PERONI 19L, SINGHA 30L). Extract each as a line item with NEGATIVE quantity (e.g., quantity: -8). The unit_price should be the deposit value. Match these against Product Master deposit entries (DEP-xxxx SKUs). The description should reflect the deposit product name.
```

No database changes needed — the deposit products and supplier entries already exist.

