# Stop Due Date From Randomly Blocking an Invoice

## Confirmed cause
Due date is an optional field, but nothing enforces that on the review path.

- `supabase/functions/parse-invoice/index.ts:808-824` — the deterministic blocking checks cover `supplier_name`, `invoice_number`, `invoice_date`, `venue`, `total_amount`. `due_date` is correctly **not** in either list.
- `parse-invoice/index.ts:557,601` — the reviewer prompt still asks Agent 2 to review `due_date` and to return a `header_check` for it, and it tells the model to raise blocking flags for header fields it cannot verify.
- Result: whether `due_date` becomes a blocking `header_flag` depends entirely on the model's free-form judgement on that run. Same invoice, different run, different outcome — exactly the "sometimes it blocks, sometimes it doesn't" behaviour.
- Client side (`InvoiceScanner.tsx:724`), any flag with `severity: "blocking"` lands in `review_blocking` and gates the approve button, regardless of which field it names.

## Changes

1. **Hard rule: due date can never block** (`supabase/functions/parse-invoice/index.ts`)
   - After the reviewer output is normalised, downgrade any `header_flag` on `due_date` from `blocking` to `warning` instead of dropping it, so a genuinely misread due date is still surfaced.
   - Apply the same downgrade to any other header field that is not in the required set, so one optional field can't silently become a gate again later.

2. **Make the prompt match the rule**
   - State explicitly that `due_date` is optional: an absent due date is normal and must never produce a blocking flag.
   - Keep the `due_date` header_check request (useful for correcting a misread date) but mark its status as informational.

3. **Verify**
   - Re-scan an invoice with no printed due date and confirm no blocking issue appears.
   - Re-scan an invoice with a printed due date and confirm it is still extracted and any mismatch shows as a warning, not a block.

## Technical scope
- Single file: `supabase/functions/parse-invoice/index.ts` (severity normalisation + reviewer prompt wording).
- No client changes, no schema changes, no change to invoice amounts, matching, or the required-field gates for supplier, invoice number, invoice date, venue, and total.
