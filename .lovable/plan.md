## Diagnosis

Console error: `Auto-GRN creation failed: column invoices.po_id does not exist`

In `src/utils/autoCreateGrnFromInvoice.ts`, the invoice load selects `po_id`:
```ts
.select("id, supplier_id, venue, po_id")
```
and the GRN insert sets `po_id: (invoice as any).po_id ?? null`.

But the `invoices` table has no `po_id` column (confirmed via DB query — only `grn_id` exists). So the SELECT 422s, the function returns early with an error, and no GRN row is created.

## Fix (single file)

`src/utils/autoCreateGrnFromInvoice.ts`:
1. Change the invoice select to `"id, supplier_id, venue"` (drop `po_id`).
2. Remove the `po_id: (invoice as any).po_id ?? null` line from the GRN insert payload.

No schema change, no other files, no logic change to the rest of the GRN flow.