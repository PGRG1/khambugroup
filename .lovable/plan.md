## Cause

The previous migration added `invoices.grn_id → goods_received_notes(id)`, while `goods_received_notes.invoice_id → invoices(id)` already existed. PostgREST now sees two FKs between the tables and refuses to auto-resolve embeds.

## Fix

A repo-wide search shows exactly **one** embed query that joins the two tables and triggers the error:

`src/components/procurement/ReceivingTab.tsx:104`
```ts
supabase.from("goods_received_notes" as any)
  .select("*, suppliers(name), purchase_orders(po_number), invoices(invoice_number)")
```

Change `invoices(invoice_number)` to `invoices!invoice_id(invoice_number)` so PostgREST uses the `goods_received_notes.invoice_id` FK.

No other `.select()` in the codebase embeds both tables (the inverse direction — invoices embedding GRN — isn't used anywhere). Nothing else changes.
