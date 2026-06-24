## Goal
Add **Accepted Price** column and **Deal Tracking** to the Invoice Scanner line-item table. Same logic mirrors into the Edit Invoice dialog so behaviour matches everywhere (we always keep these two views in lockstep). No changes to GRN logic, confirmation flow, status transitions, or the invoice list.

## Schema notes (deviation from the prompt)
The prompt references `product_master.supplier_id`, `product_master.sku`, and a `supplier_id` on the invoice. The actual schema is:
- Supplier-level data lives in `product_suppliers` (linked to `product_master` via `product_master_id`). `external_sku` and `supplier_product_name` live there.
- `invoices.supplier_id` references `suppliers.id`; `item_supplier_deals.supplier_id` also references `suppliers.id` — they match directly.
- Per-product price lives on `product_suppliers.purchase_unit_cost` (scoped per supplier). I'll use that as the authoritative "Items Master price" for the matched supplier, falling back to `product_master.unit_cost`.

The scanner already has a resolver (`productMasterResolver`) and tracks `pm_unit_price` + a `price_changed` flag — I'll build on top of it rather than introduce a parallel lookup.

---

## Part 1 — Accepted Price

### 1.1 Database (migration)
On `invoice_line_items` add:
- `accepted_price numeric(10,4)` — nullable
- `price_disputed boolean not null default false`
- `is_free_unit_line boolean not null default false`
- `deal_id uuid references item_supplier_deals(id) on delete set null`

Add an index on `(deal_id)`.

### 1.2 Master-price resolution
When a line is loaded (AI scan, manual add, product picker, or initial load of an existing invoice):
1. Resolve the supplier-scoped `product_suppliers` row using the existing resolver (priority: invoice supplier + external_sku, then external_sku-only, then name fuzzy).
2. Set `master_price = product_suppliers.purchase_unit_cost` (fallback `product_master.unit_cost`).
3. Initialise `accepted_price = master_price` on first load. If no match, leave `accepted_price = null` and show a grey "No master price" label — no dispute.

`master_price` is held in component state (`pm_unit_price` already exists) and is read-only as far as the user is concerned.

### 1.3 New column in the line table
After the existing Acc. Qty column, insert:

| Column | Source | Editable |
|---|---|---|
| Inv. price | `unit_price` | no |
| Acc. price | `accepted_price` | yes (number, 2 dp) |

Under the Acc. price input, render:
- `Master: $X.XX` (grey, static) when a master price is known.
- Amber input border when `accepted_price ≠ master_price`.
- `No master price` when null.

### 1.4 Real-time `price_disputed`
```
price_disputed =
  accepted_price IS NOT NULL
  AND !is_free_unit_line
  AND round(accepted_price, 2) !== round(unit_price, 2)
```
Recompute on every keystroke. Persist on save.

### 1.5 Status badge update
Extend the existing per-line badge logic:

| Condition | Badge |
|---|---|
| qty match + price match | ✓ Matched (green) |
| qty dispute only | ⚠ Qty dispute (amber) |
| price dispute only | ⚠ Price dispute (amber) |
| both | ⚠ Qty + price (red) |
| `is_free_unit_line` | 🏷 Deal — free unit (blue) |

Free-unit lines never count toward price dispute.

### 1.6 "Update master" banner
Below the line table, one dismissible inline banner at a time. Shown when the most-recently-edited line has `accepted_price !== master_price` and a `product_master_id` is known.
```
🏷  Accepted price differs from Items Master for {item name}. Update master to $X.XX?
    [ Update master ]  [ Keep current ]
```
- **Update master**: write `product_suppliers.purchase_unit_cost = accepted_price` for that `(product_master_id, supplier)` row (scoped by tenant). Update the in-memory `master_price` on the line, clear amber, dismiss.
- **Keep current**: dismiss banner only; amber + `price_disputed` remain.

Banner replaces itself when the user edits a different line. Never stacks.

### 1.7 Totals footer
Add two rows beneath existing totals (which we keep — they stay the source of recon-truth):
```
Accepted total: $X,XXX.XX   sum(accepted_price * accepted_qty) over lines with non-null accepted_price
Variance:       ±$XXX.XX    accepted - invoice subtotal (red if negative, green if positive)
```
"Doc total" / recon delta logic stays untouched.

---

## Part 2 — Deal tracking

### 2.1 Free-unit detection
On every line load/edit, mark `is_free_unit_line = true` when:
```
unit_price === 0 AND quantity > 0 AND product_master_id !== null
```

Then look up an active deal:
```
SELECT id, buy_qty, free_qty
FROM item_supplier_deals
WHERE tenant_id = current
  AND product_id = line.product_master_id
  AND supplier_id = invoice.supplier_id
  AND is_active = true
  AND deal_type = 'buy_x_get_y_free'
LIMIT 1
```
Cache all active deals for the invoice supplier in one fetch per scan/edit session.

If matched → set `deal_id`. If not → leave `deal_id = null` (shows as "Zero price — unlinked").

### 2.2 Free-unit rendering
- Inv. price cell shows `$0.00` + blue **Deal** chip.
- Acc. price input becomes read-only and locked at 0.
- Status badge: 🏷 Deal — free unit (blue).
- When `deal_id` is set, tooltip / sub-label: `{buy_qty}+{free_qty} · {supplier name}`.

### 2.3 Missing-deal warning
After all lines are loaded (and on every line change), for each active deal of the invoice supplier:
```
paid_qty   = sum(quantity) of lines where product_master_id = deal.product_id AND unit_price > 0
free_qty_g = sum(quantity) of lines where product_master_id = deal.product_id AND is_free_unit_line
expected   = floor(paid_qty / deal.buy_qty) * deal.free_qty
if expected > 0 AND free_qty_g < expected → emit warning
```
Render yellow inline alert above the line-item table, one per missing deal, informational only (doesn't block confirmation):
```
⚠ Deal not fully applied: {item} — expected {expected - found} free unit(s) ({buy}+{free} deal with {supplier}). Check with supplier.
```

### 2.4 Effective cost label
For lines with a linked `deal_id` and a non-zero accepted_price, beneath the Acc. price input show:
```
Effective: ${eff} / {uom}
eff = (deal.buy_qty * accepted_price) / (deal.buy_qty + deal.free_qty)
```
Display-only. Not written to GRN.

---

## Persistence
`onSave` payload (scanner) and the update path (editor) extend to include the four new fields per line. GRN auto-creation still uses `accepted_qty * accepted_price` (it already uses accepted qty; price source today is `unit_price` — confirm with you whether GRN should switch to `accepted_price` for valuation, see Open Question below).

## Files touched
- **Migration** — add 4 columns + index on `invoice_line_items`.
- `src/components/invoices/InvoiceScanner.tsx` — line type, master-price seed, edit handler, columns, banner, totals, deal logic, missing-deal alerts, payload.
- `src/components/procurement/ProcurementInvoicesTab.tsx` — same UI/logic in the Edit Invoice dialog (kept in lockstep per existing rule).
- `src/utils/autoCreateGrnFromInvoice.ts` — pass `accepted_price` through for GRN valuation **only if** you confirm GRN should use accepted price (otherwise no change).
- No changes to the invoice list, status transitions, or `parse-invoice` edge function.

## Open question (one)
**GRN valuation source**: the prompt says "GRN still uses `accepted_qty × accepted_price`" — today the GRN uses unit_price. Do you want me to switch GRN valuation to `accepted_price` when present (falling back to `unit_price`)? Defaulting to **yes** unless you say otherwise — it matches the prompt's wording and your earlier net_unit_cost direction.
