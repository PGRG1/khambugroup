

## Plan: Use Product Master Name for Matched Items

### Problem
The AI scanner generates inconsistent descriptions for the same product across different invoices, even when the product is correctly matched to a Product Master entry.

### Solution
After the AI returns extracted data, **post-process matched items** to replace the AI-generated description with the `supplier_product_name` from the Product Master. This is more reliable than prompt engineering since it guarantees consistency.

For unmatched items (no `matched_sku`), keep the AI-extracted description as-is and visually flag them for user review.

### Changes

**`src/components/invoices/InvoiceScanner.tsx`** (~lines 155-170, where AI response is mapped to `ScannedLineItem[]`)

After mapping line items from the AI response, add a post-processing step:
- If a line item has a `matched_sku`, look up the corresponding Product Master entry
- Replace `description` with `productMaster.supplier_product_name`
- If the item has no `matched_sku`, leave description as-is (it already gets flagged as "Unmatched" in the Line Items view)

This is a small change — roughly 5 lines of logic added to the existing mapping block where `li.matched_sku` is already being read.

### Why post-processing, not prompt changes
- The AI prompt already does matching well — the issue is only the description text
- Post-processing is deterministic: same SKU = same name, every time
- No risk of the AI ignoring instructions or paraphrasing

