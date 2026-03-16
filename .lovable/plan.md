

## Plan: Improve Invoice Scanner Accuracy and Add Validation Flags

### 1. Improve AI OCR Accuracy

**Edge function (`supabase/functions/parse-invoice/index.ts`)**:
- Upgrade model from `google/gemini-2.5-flash` to `google/gemini-2.5-pro` for better number/text reading accuracy
- Add a second-pass verification prompt: after extraction, send the data back with the images asking the AI to double-check all numbers, especially quantities, unit prices, and totals
- Increase `max_tokens` from 16000 to 32000 to accommodate verification pass
- Add stronger prompting: "Read each number digit by digit", "If a character is ambiguous, state the most likely reading", emphasize column alignment awareness

### 2. Rounding Rules for Line Items and Invoice Totals

**InvoiceScanner.tsx** — in `calcLineTotal` and `saveInvoice`:
- Keep line item totals at full precision (2 decimal places, no rounding beyond that) for all suppliers
- At invoice total level: if supplier is "Beverage World" (match by name), round the total to nearest integer; for all others, show exact 2 decimal places
- Display formatting: use `toFixed(2)` everywhere for line items; apply rounding only to the subtotal/total display and the saved `total_amount` for Beverage World

### 3. Flag SKU Mismatches After Scan

**InvoiceScanner.tsx** — in the review form:
- After AI scan, for each line item with a `matched_sku`, compare `item_code` (external SKU from invoice) against the Product Master's `external_sku` for that matched entry
- If they don't match, show an amber/warning badge next to the item code field: "SKU mismatch"
- Add a visual indicator (amber background on that row) so the user can review

### 4. Flag Invoice Total Mismatch

**InvoiceScanner.tsx** — in the review form:
- The AI returns `total_amount` on each invoice header. Store this as `ai_total` on the ScannedInvoice interface
- Compare `ai_total` (the number read from the invoice document) against the calculated sum of line items
- If they differ by more than $0.50, show a red warning banner: "Invoice total ($X) doesn't match line items total ($Y)"
- This helps catch misread numbers

### 5. Flag Duplicate Invoices

**InvoiceScanner.tsx** — in `saveInvoice` and during scan review:
- Before saving, query the `invoices` table for matching `invoice_number` + `supplier_id`
- If a match is found, show a warning dialog: "Invoice #X from this supplier already exists (dated Y). Save anyway?"
- Also check during scan review: after AI extraction, query existing invoices and flag any matches with a red badge on the invoice navigation bar

### 6. Default "Save All" Button for Multi-Page Single Invoice

**InvoiceScanner.tsx** — button layout:
- Currently shows "Save This Invoice" as primary and "Save All" as secondary
- When there's only 1 invoice extracted (even from multiple pages), the button already says "Save This Invoice" which is correct
- When there are multiple invoices: make "Save All Invoices" the primary (default) button, and "Save This Invoice" the secondary
- Swap the button order and styling so "Save All" is prominent by default

### Files to Change

1. **`supabase/functions/parse-invoice/index.ts`** — upgrade model, add verification pass, return `total_amount` from AI
2. **`src/components/invoices/InvoiceScanner.tsx`** — add `ai_total` field, SKU mismatch flags, total mismatch warning, duplicate check, rounding logic, button reordering
3. **`src/components/procurement/ProcurementInvoicesTab.tsx`** — pass supplier name info for rounding logic, duplicate check query

