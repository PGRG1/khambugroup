

## Plan: Update Invoice Scanner to Use Correct Deposit Codes and Names

### Problem
The returned empty keg line items extracted by the scanner don't include the correct `item_code` (External SKU) from the Product Master. The user wants the scanner to output the exact external SKU codes and supplier product names that match the Product Master deposit entries.

### Deposit Product Reference (from Product Master)

| External SKU | Supplier Product Name |
|---|---|
| ABADEK | ASAHI SUPER DRY KEG (EMPTY) DEPOSIT - 10L |
| ABASEK | ASAHI SOUR KEG (EMPTY) DEPOSIT - 10L |
| ABADE2 | ASAHI SUPER DRY KEG (EMPTY) DEPOSIT - 20L |
| ABPNEK | PERONI NASTRO AZZURRO KEG (EMPTY) DEP - 19L |

### Implementation

**Single file: `supabase/functions/parse-invoice/index.ts`** — Update the returned kegs instruction (lines 108-114) to explicitly tell the AI to:

1. Set `item_code` to the matching External SKU (e.g., `ABADEK`, `ABASEK`, `ABADE2`, `ABPNEK`)
2. Set `description` to the exact Supplier Product Name from the Product Master
3. Set `unit` to `CTN` and `pack_size` to `4X4LB` (matching the screenshot format)
4. Provide the explicit mapping table so the AI doesn't have to guess:
   - ASAHI 20L → code: `ABADE2`, desc: `ASAHI SUPER DRY KEG (EMPTY) DEPOSIT - 20L`
   - ASAHI 10L → code: `ABADEK`, desc: `ASAHI SUPER DRY KEG (EMPTY) DEPOSIT - 10L`
   - ASAHI SOUR 10L → code: `ABASEK`, desc: `ASAHI SOUR KEG (EMPTY) DEPOSIT - 10L`
   - ASAHI KURONAMA 10L → code: `ABAKBKZJ` (if exists, otherwise leave for Product Master matching)
   - PERONI 19L → code: `ABPNEK`, desc: `PERONI NASTRO AZZURRO KEG (EMPTY) DEP - 19L`

This ensures the scanner outputs deposit items with the correct codes and names that will auto-match to the Product Master during saving.

