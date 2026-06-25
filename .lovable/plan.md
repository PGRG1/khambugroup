## Goal
Persist `accepted_price` on `grn_items` and wire it through GRN creation, sync, and the Receiving UI so the GRN reflects accepted price (not just invoiced price).

## Steps

1. **Migration** — add column:
   ```sql
   ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS accepted_price numeric(12,4);
   ```

2. **`src/utils/autoCreateGrnFromInvoice.ts`**
   - Add `accepted_price` to the `invoice_line_items` select string.
   - In the `stockLines.map` payload insert:
     `accepted_price: Number(l.accepted_price) > 0 ? Number(l.accepted_price) : unitCost`

3. **`src/utils/syncGrnFromInvoice.ts`**
   - In both the update and insert blocks, add:
     `accepted_price: Number(line.accepted_price) > 0 ? Number(line.accepted_price) : resolveUnitCost(line)`

4. **`src/components/procurement/ReceivingTab.tsx`**
   - `handlePickInvoice` select: include `accepted_qty, net_unit_cost, accepted_price`.
   - Prefill:
     - `quantity_received: it.accepted_qty != null ? Number(it.accepted_qty) : Number(it.quantity)`
     - `unit_cost: Number(it.net_unit_cost) > 0 ? Number(it.net_unit_cost) : Number(it.unit_price)`
   - GRN line items display:
     - Received qty → `Number(it.accepted_qty ?? it.quantity_received)`
     - Unit cost → `Number((it as any).accepted_price > 0 ? (it as any).accepted_price : it.unit_cost)`

No other files touched. Migration runs first so the column exists before code references it.
