# Stop the Invoice Scanner from Forcing Disputed Status

## Goal
Let the user override the scanner’s suggested **Disputed** status. Quantity or accepted-price differences will remain visible as warnings, but they will not silently change the selected status or force disputed save behavior.

## Confirmed cause
- The scanner calculates line-level quantity differences separately from `invoice_status`.
- Any quantity difference triggers an effect that sets the invoice status to `disputed`.
- The save button label and reason validation use the raw difference count rather than the user-selected status, so they can still show **Save with N Disputed** even when Status is changed to **Outstanding**.
- Accepted quantity remains intentionally independent after it has been manually edited, which can leave a real variance even when purchase quantity is later changed.

## Changes
1. **Respect manual status selection**
   - Track whether the status was explicitly selected by the user.
   - Allow the scanner to suggest/set `disputed` when a variance first appears, but never overwrite a later manual choice.
   - Reset this override state when reviewing a different scanned invoice.

2. **Align save behavior with the selected status**
   - Require dispute reasons/notes only when the selected invoice status is `disputed`.
   - Show **Save with N Disputed** only when the invoice is actually being saved as disputed.
   - For Outstanding, Paid, or Under Review, use the normal save label and do not block saving solely because a variance remains.

3. **Keep differences visible without forcing workflow**
   - Continue showing accepted quantity, difference, accepted subtotal, and variance amounts.
   - Replace the forced-dispute message with a warning that the invoice has unresolved quantity differences while the selected non-disputed status will be respected.
   - Preserve the line-level variance data on save for audit and receiving follow-up.

4. **Verify the interaction**
   - Reproduce a scan with quantity differences.
   - Change Status from Disputed to Outstanding and confirm it remains Outstanding after line edits.
   - Confirm the CTA becomes the normal approval/save action and no dispute-reason requirement blocks it.
   - Confirm choosing Disputed still requires reasons and shows the disputed save label.

## Technical scope
- Frontend scanner state and validation only in `src/components/invoices/InvoiceScanner.tsx`.
- No changes to invoice amounts, matching, balances, database schema, or posting logic.