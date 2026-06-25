Edit only `src/hooks/useInvoiceData.ts`:

1. Delete the entire `syncLineItemsToInventory` `useCallback` (declaration and body).
2. In `createInvoice`, remove the `await syncLineItemsToInventory(lineItems);` call.
3. Remove `syncLineItemsToInventory` from `createInvoice`'s dependency array.
4. It is not present in the hook's return object, so no change needed there.

No other files or logic touched. Rationale: inventory is now sourced from GRNs, so the legacy direct inventory sync on invoice creation is obsolete.