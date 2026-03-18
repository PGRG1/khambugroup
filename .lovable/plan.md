

## Plan: Fix Incorrectly Linked Telford Products

### Problem
SKUs `BEV-0110` through `BEV-0113` already existed as different products (House Tequila, House Gin, Finest Call Lime Cordial, Potters Vodka). The Telford supplier entries for the 4 Asahi/Peroni kegs were incorrectly added to these existing products instead of creating new product_master records.

Additionally, supplier product names for the Asahi Sour and Kuronama kegs are missing the "(JPN)" prefix from the Excel file.

### Fix (data operations only, no code changes)

**Step 1: Delete the 4 incorrect `product_suppliers` entries** that linked Telford keg products to the wrong product_master records:
- `20428f7c-...` (ASAHI SUPER DRY KEG → wrongly on House Tequila BEV-0110)
- `7a878963-...` (PERONI KEG → wrongly on House Gin BEV-0111)
- `d1007e17-...` (ASAHI SOUR KEG → wrongly on Lime Cordial BEV-0112)
- `367fe826-...` (ASAHI KURONAMA KEG → wrongly on Potters Vodka BEV-0113)

**Step 2: Create 4 new `product_master` entries** with new SKUs (BEV-0124 through BEV-0127):

| New SKU | Internal Product Name | L1 | L2 | L3 | Purch Unit | Unit Cost | Base Unit | Base Qty | Cost/Base |
|---|---|---|---|---|---|---|---|---|---|
| BEV-0124 | Asahi Super Dry Keg 20L | Beverages | Alcoholic | Draft Beer | KEG | 1150 | ml | 20000 | 0.0575 |
| BEV-0125 | Peroni Nastro Azzurro Keg 19L | Beverages | Alcoholic | Draft Beer | KEG | 1250 | ml | 19000 | 0.0658 |
| BEV-0126 | Asahi Sour Keg 10L | Beverages | Alcoholic | Draft Beer | KEG | 780 | ml | 10000 | 0.078 |
| BEV-0127 | Asahi Kuronama Dark Keg 10L | Beverages | Alcoholic | Draft Beer | KEG | 640 | ml | 10000 | 0.064 |

**Step 3: Create 4 new `product_suppliers` entries** linking the new products to Telford, with correct supplier product names (including "(JPN)" prefix for BEV-0126 and BEV-0127):
- ABADK2 → ASAHI SUPER DRY KEG 1X20L
- ABPNKZ → PERONI NASTRO AZZURRO KEG 1X19L
- ABASKZJ → (JPN) ASAHI SOUR KEG 1X10L
- ABAKBKZJ → (JPN) ASAHI KURONAMA DARK KEG 1X10L

### Files changed
None — this is purely a data fix using the database insert tool.

