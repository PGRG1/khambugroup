## Diagnosis

GRN line value is a generated column: `total = quantity_received * unit_cost`. Out of 9,512 GRN items, **335 have a zero total**:

- 332 rows: `unit_cost = 0`
- 3 rows: `quantity_received = 0`

For every zero-cost GRN row, the source `invoice_line_items` row also has `unit_price = 0`, `normalized_unit_cost = NULL`, and line `total = 0`. So the GRN is faithfully copying what was captured on the invoice — **the break is upstream in the invoice data**, not in the GRN logic.

Looking at the actual items, they fall into two groups:

1. **Genuine freebies / marketing items** (the majority — ~325 rows): coasters, plastic cups, branded mugs, lighters, pens, pineapple leaf garnish, etc. These really were billed at $0 by the supplier.
2. **Suspicious zeros** (a small handful): items where `product_master.unit_cost` is non-zero, e.g. Cherry Tomato ($19), Asahi Super Dry Keg ($1,150), Coriander ($40). These look like data-entry / scan misses on the original invoice.

## Where the break is

`src/utils/autoCreateGrnFromInvoice.ts` line ~80:
```ts
const unitCost = Number(l.unit_price) || 0;
```
No fallback. If the invoice line price is missing, the GRN inherits a zero.

## Proposed fix

Add a cost-resolution fallback chain inside `autoCreateGrnFromInvoice` (and the historical backfill), in this order:

1. `invoice_line_items.unit_price` (current behaviour)
2. `invoice_line_items.normalized_unit_cost` (already computed by the scanner for some rows)
3. `invoice_line_items.total / quantity` when `total > 0` and `quantity > 0` (recovers cases where only the line total was captured)
4. `product_master.unit_cost` (last-resort valuation using the SKU's standing cost)

If all four are zero, the row stays at zero — that's the correct outcome for genuine freebies.

Then run a one-shot SQL recompute over the existing 332 zero-cost GRN rows using the same chain so historical data heals immediately. Stock on Hand and Deposit Ledger will pick up the new values automatically (they read `unit_cost * quantity` from grn_items).

## Decision needed

Do you want the product_master fallback (step 4) included? It will value the few suspicious zeros (Cherry Tomato, Asahi Keg, Coriander, etc.) but will also assign a non-zero cost to any "freebie" that happens to have a standing cost in product_master — which may or may not reflect reality.

- **Yes, include master cost fallback** — maximises valuation, masks invoice data-entry gaps
- **No, stop at step 3** — only recover rows where the invoice has a line total but no unit price; genuine zero-priced invoice lines remain at $0