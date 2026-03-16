

## Plan: Post-Extraction Validation and Auto-Correction for Invoice Totals

### Problem
The AI sometimes extracts line item totals that don't match `quantity * unit_price` (or `weight * unit_price` for weighted items), and the invoice `total_amount` sometimes doesn't match the sum of line totals. There's no validation or correction step.

### Solution
Add a server-side validation pass in the `parse-invoice` edge function that runs after AI extraction. It will:
1. For each line item, verify `qty * unit_price ≈ total` (or `weight * unit_price ≈ total` for weighted items)
2. If mismatched, recalculate and overwrite the line total from the base values
3. Sum all corrected line totals and compare against the invoice `total_amount`
4. If the invoice total doesn't match the sum of line totals, flag it
5. Return a `warnings` array per invoice so the frontend can display flagged issues

On the frontend (InvoiceScanner), display any returned warnings as a yellow banner above the line items table.

### Technical Details

**Edge function (`supabase/functions/parse-invoice/index.ts`)**:
After the Chinese translation pass, add a validation loop:
```
for each invoice:
  for each line_item:
    expected = weight ? weight * unit_price : quantity * unit_price
    if |expected - total| > 0.5:
      line_item.total = round(expected, 2)  // auto-correct
      add warning: "Line X: total corrected from Y to Z"
  
  sumOfLines = sum(line_item.total)
  if |sumOfLines - total_amount| > 1.0:
    add warning: "Invoice total (X) differs from sum of lines (Y)"
    // Don't auto-correct invoice total — flag for user review
```

Return `warnings: string[]` alongside each invoice object.

**Frontend (`InvoiceScanner.tsx`)**:
- Read `warnings` from the scanned invoice data
- Display as a yellow/amber alert banner when warnings exist, listing each discrepancy
- Warnings are informational — user can still edit and save

### Files Changed
1. `supabase/functions/parse-invoice/index.ts` — add validation loop after translation
2. `src/components/invoices/InvoiceScanner.tsx` — display warnings banner

