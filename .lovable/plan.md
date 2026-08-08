# Allow Saving Invoices That Have Quantity Disputes

## Confirmed cause
In the invoice editor (`src/components/procurement/ProcurementInvoicesTab.tsx`), the Save Changes button is disabled whenever any disputed line is missing a reason, or a line marked "other" is missing a note:

```
disabled={ saving || !supplier_id || !invoice_number || !invoice_date
  || editDisputeStats.missingReason > 0
  || editDisputeStats.missingNote > 0 }
```

That is why the button is greyed out in your screenshot even though the banner says "You can still save the invoice."

A second effect force-sets the invoice status to `disputed` whenever any accepted quantity differs, overwriting a manual status choice (the same pattern already fixed in the scanner).

## Changes

1. **Unblock save**
   - Remove `missingReason` / `missingNote` from the disabled condition. Save stays disabled only for the true requirements: supplier, invoice number, invoice date, and while saving.

2. **Keep the reason prompt as a visible warning, not a blocker**
   - Keep the amber banner and the red dot on lines missing a reason so the discrepancy is still obvious and can be followed up.
   - Update the banner wording to state clearly that missing reasons will be saved as unspecified.
   - Disputed lines without a reason save with `receiving_reason = null`, exactly as today's save path already handles.

3. **Respect a manually chosen status**
   - Suggest `disputed` when a variance first appears, but do not overwrite the status after the user picks one manually.
   - Reset that override tracking when a different invoice is opened for editing.

## Technical scope
- Single file: `src/components/procurement/ProcurementInvoicesTab.tsx` (button disabled condition, banner copy, status effect).
- No change to totals, accepted-quantity math, line persistence, GRN sync, or database schema.
