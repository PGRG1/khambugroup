

## Plan: Strengthen Returned Keg Extraction in Scanner Prompt

### Problem
The scanner is not applying the keg mapping table. The screenshot shows returned kegs extracted with generic descriptions ("ASAHI 10L"), wrong pack_size ("4X4LB"), wrong unit ("CTN"), and zero prices — the AI model is ignoring the mapping instructions.

### Root Cause
The mapping instructions are buried in a long rules list. The AI model is likely extracting the returned keg rows as regular line items before reaching the mapping rules, or isn't recognizing them as "returned kegs" because the invoice format differs from what the prompt describes.

### Fix: `supabase/functions/parse-invoice/index.ts`

1. **Move the returned kegs instructions higher in the prompt** — place them right after the line_items JSON schema definition (around line 90), not buried in the rules list at line 108+.

2. **Make the instructions more explicit and forceful**:
   - Add "CRITICAL" prefix to ensure the AI prioritizes this
   - Explicitly state: these are NOT regular products — do NOT use the pack_size, unit, or price from the invoice table
   - Specify that `pack_size` should be empty string `""` for deposits
   - Specify that `unit` should be `"Keg"` or `"Each"` (not CTN)
   - Reiterate that `unit_price` MUST be `50`, not `0`

3. **Update the mapping table format** to be clearer — use a structured block that's harder for the model to skip:
   ```
   CRITICAL — RETURNED/EMPTY KEGS MAPPING (MUST FOLLOW EXACTLY):
   When you see "ASAHI 10L" in returned section → item_code: "ABADEK", description: "ASAHI SUPER DRY KEG (EMPTY) DEPOSIT - 10L", pack_size: "", unit: "Keg", unit_price: 50
   When you see "ASAHI 20L" → item_code: "ABADE2", description: "ASAHI SUPER DRY KEG (EMPTY) DEPOSIT - 20L", pack_size: "", unit: "Keg", unit_price: 50
   When you see "ASAHI SOUR" or "ASAHI SOUR (BLUE)" → item_code: "ABASEK", description: "ASAHI SOUR KEG (EMPTY) DEPOSIT - 10L", pack_size: "", unit: "Keg", unit_price: 50
   When you see "PERONI" → item_code: "ABPNEK", description: "PERONI NASTRO AZZURRO KEG (EMPTY) DEP - 19L", pack_size: "", unit: "Keg", unit_price: 50
   When you see "KURONAMA" or "DARK" keg → item_code: "ABAKBKZJ", description: "ASAHI KURONAMA DARK KEG (EMPTY) DEPOSIT - 10L", pack_size: "", unit: "Keg", unit_price: 50
   When you see "SINGHA" → item_code: "", description: "SINGHA KEG (EMPTY) DEPOSIT - 30L", pack_size: "", unit: "Keg", unit_price: 50
   ```

4. **Add explicit anti-patterns**: "Do NOT output pack_size '4X4LB' or unit 'CTN' or unit_price 0 for returned kegs."

### Files Changed
- `supabase/functions/parse-invoice/index.ts` — rewrite the returned kegs section of the system prompt

