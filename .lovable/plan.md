## Goal

When the user confirms an invoice in the Invoice Scanner, automatically create a matching GRN (`goods_received_notes` + `grn_items`) using the receiving fields already captured on each invoice line. No UI changes, no changes to the manual New GRN form, no changes to the GRN list page.

## Schema gap check

The existing tables don't fully match the prompt's column names. Reconciling against current DB:

`goods_received_notes` already has: `grn_number`, `po_id`, `invoice_id`, `supplier_id`, `venue` (text), `status`, `received_date` (date), `notes`, `received_by`. → No new columns needed. We'll write `venue` (text from invoice), `po_id` (the prompt's "linked_po_id"), `received_date = today`, leave `grn_number` to its existing default/trigger.

`grn_items` already has: `grn_id`, `invoice_line_item_id`, `product_master_id`, `description`, `quantity_invoiced`, `quantity_received`, `unit`, `unit_cost`, `total`. Missing the receiving-trail fields.

`invoices` has no `grn_id` column.

### Migration (single file)

- `ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS grn_id uuid REFERENCES public.goods_received_notes(id) ON DELETE SET NULL;`
- `ALTER TABLE public.grn_items` add nullable columns: `accepted_qty numeric`, `qty_difference numeric`, `receiving_reason text`, `receiving_note text`.
- Index `CREATE INDEX IF NOT EXISTS idx_invoices_grn_id ON public.invoices(grn_id);`

No RLS / GRANT changes (existing policies on both tables already cover the new columns).

## Field mapping (invoice line → grn_items row)

| grn_items column | source from `invoice_line_items` |
|---|---|
| `grn_id` | new GRN id |
| `invoice_line_item_id` | line.id |
| `product_master_id` | line.product_master_id |
| `description` | line.description |
| `quantity_invoiced` | line.quantity |
| `quantity_received` | line.accepted_qty ?? line.quantity |
| `unit` | line.unit ?? "each" |
| `unit_cost` | line.unit_price |
| `total` | (accepted_qty) × unit_price |
| `accepted_qty` | line.accepted_qty |
| `qty_difference` | line.qty_difference |
| `receiving_reason` | line.receiving_reason |
| `receiving_note` | line.receiving_note |

`po_item_id` and `quantity_ordered` left null (no PO link from the scanner path).

## Code changes

### 1. New helper: `src/utils/autoCreateGrnFromInvoice.ts`

Exports `autoCreateGrnFromInvoice(invoiceId, { tenantId, userId })`:

1. **Idempotency** — `select id, grn_number from goods_received_notes where invoice_id = invoiceId limit 1`. If a row exists, return `{ skipped: true, grn }` and do nothing.
2. Load the invoice (`supplier_id, venue, po_id` if it exists on `invoices`; otherwise null) and its `invoice_line_items`.
3. Insert one `goods_received_notes` row with `status: "confirmed"` initially, `received_date = today`, `notes: ""`, `received_by = userId`, `po_id = invoice.po_id ?? null`, `tenant_id`. Capture `id` and `grn_number`.
4. Build the `grn_items` payload from every invoice line using the mapping table above. Single `.insert(payload)` batch.
5. If any line has `qty_difference !== 0`, `update goods_received_notes set status='disputed' where id = grn.id`.
6. `update invoices set grn_id = grn.id where id = invoiceId`.
7. **Rollback on failure** — if step 4 fails, delete the GRN row (mirrors existing pattern in `ReceivingTab.doSave`). True DB transactions aren't available from the JS client; this best-effort cleanup is the same approach already in the codebase.
8. Return `{ skipped: false, grn, disputed }`. On any thrown error, catch and return `{ error }` — never throw.

### 2. Hook into the scanner save in `src/components/procurement/ProcurementInvoicesTab.tsx`

Inside the existing `onSave` passed to `<InvoiceScanner>` (around lines 1183–1203), **after** `createInvoice(...)` resolves with `created?.id`, call:

```ts
const grnResult = await autoCreateGrnFromInvoice(created.id, { tenantId, userId: user.id });
```

Then surface feedback via `toast` (sonner — already imported in this file):

- `grnResult.skipped` → no toast (silent, as per spec).
- `grnResult.error` → `toast.error("Invoice confirmed, but GRN creation failed — see console")` + `console.error`. Do not block.
- success, not disputed → `toast.success("Invoice confirmed. GRN " + grn_number + " created and posted to inventory.", { action: { label: "View GRN", onClick: () => navigate("/procurement/receiving") } })`.
- success, disputed → `toast.warning("Invoice confirmed with disputes. GRN " + grn_number + " created — review disputed lines.", { action: { label: "View GRN", onClick: () => navigate("/procurement/receiving") } })`.

`useNavigate` is already used in this file (or added if not). The toast action points to the Receiving page — there is no per-GRN detail route, so this is the closest equivalent.

The existing `runBaniScan` non-blocking call stays unchanged.

### 3. (No edits anywhere else)

- `InvoiceScanner.tsx` — untouched.
- `ReceivingTab.tsx` — untouched.
- `useInvoiceData.ts` — untouched (the new `grn_id` column on `invoices` is optional and not read by the existing `Invoice` interface; no consumer breaks).

## Out of scope

UI of the scanner, manual GRN form, GRN list page, invoice pricing/totals math, inventory ledger writes beyond what `grn_items.insert` already triggers, per-GRN detail page.

## Order of operations

1. Run the migration (adds `invoices.grn_id` + four GRN-item receiving columns).
2. Add `src/utils/autoCreateGrnFromInvoice.ts`.
3. Wire the call + toast into `ProcurementInvoicesTab.tsx` `onSave`.
