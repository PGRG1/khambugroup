# Invoice Discount: % and $ Support with Proportional Distribution

Upgrade the discount system across the invoice scanner, invoice edit view, and GRN auto-creation so that:
- Both line-level and header-level discounts support `%` and `$` modes.
- Header discounts are distributed proportionally to lines so each line carries a true `net_unit_cost`.
- GRN/inventory valuations use the post-discount net cost (today they use the pre-discount unit price, inflating inventory and recipe costing).

Existing rounding behaviour (`invoiceRounding.ts` per-supplier modes), receiving columns, dispute auto-flip, and all other pages are untouched.

---

## Step 1 — Database migration

Add discount fields to `invoice_line_items` and `invoices`, then backfill existing rows.

**`invoice_line_items` new columns**
- `discount_mode text` — `"fixed"` or `"percentage"`, default `"fixed"`
- `discount_rate numeric` — percentage value (e.g. `10` = 10%), default `0`
- `line_discount_amount numeric` — calculated $ from the line's own discount, default `0`
- `header_discount_share numeric` — portion of the header discount allocated to this line, default `0`
- `net_unit_cost numeric` — final per-unit cost after line + header discounts, default `0`

**`invoices` new columns**
- `discount_mode text` — default `"fixed"`
- `discount_rate numeric` — default `0`

**Backfill**
- `line_discount_amount = discount`, `discount_mode = 'fixed'`, `discount_rate = 0`, `header_discount_share = 0`.
- `net_unit_cost = (quantity * unit_price - discount) / quantity` when `quantity > 0`, else `unit_price`.

Existing `invoices.discount`, `invoices.discount_type`, and `invoice_line_items.discount` are kept and continue to hold the fixed $ amount.

---

## Step 2 — Shared calculation utilities in `src/utils/invoiceRounding.ts`

Only **add** new exports.

- `type DiscountMode = "fixed" | "percentage"`
- `calcLineDiscount(lineGross, mode, rate, fixed)` → $ amount for the line.
- `calcHeaderDiscount(subtotal, mode, rate, fixed)` → header $ amount.
- `distributeHeaderDiscount(lineNets[], headerAmount)` → per-line shares, proportional to each line's net; last line absorbs rounding remainder.
  - **Edge case guard**: if `lineNets` is empty, total is `0`, or `headerAmount` is `0`, return all zeros immediately — no division and no last-line adjustment, preventing any divide-by-zero (covers the all-100%-line-discount scenario).
- `calcNetUnitCost(qty, unitPrice, lineDiscount, headerShare)` → 4dp per-unit net cost (returns `unitPrice` when `qty = 0`).
- `recalcAllDiscounts(lines, headerMode, headerRate, headerFixed, roundingMode)` → returns updated lines with `line_discount_amount`, `header_discount_share`, `net_unit_cost`, and rounded `total`. Single shared implementation for scanner + edit view.

---

## Step 3 — `InvoiceScanner.tsx` UI + state

**Line row**
- Extend `EditableInvoiceLine` and `emptyEditLine` with `discount_mode` (default `"fixed"`), `discount_rate` (`"0"`), `line_discount_amount`, `header_discount_share`, `net_unit_cost`.
- Replace existing line discount `<Input>` with:

```text
[%] [$]  [ input ]   Disc: $X.XX   Net: $Y.YY/unit
```

  - Toggle picks `%` vs `$`; in `%` mode input is the rate, in `$` mode it's the fixed amount.
  - Muted read-only labels show calculated line discount and resulting per-unit net cost.

**Header / footer**
- Add `invoice_discount_mode` and `invoice_discount_rate` to scanner state.
- Header control: `Type: [Discount | Refund]   Mode: [% | $]   Amount: [ input ]   Calculated: $X.XX`.

**Footer summary**

```text
Line discounts:     -$X.XX
Invoice discount:   -$X.XX
─────────────────────────
Total discounts:    -$X.XX
Net subtotal:        $X.XX   ← flows to GRN / inventory
Tax:                 $X.XX
Invoice total:       $X.XX   ← what you pay
```

When `discount_type = "refund"` the header label reads "Refund" and the amount renders amber; distribution math is identical.

**Recalculation**
- Call `recalcAllDiscounts` whenever `quantity`, `unit_price`, line `discount` / `discount_mode` / `discount_rate`, or header `invoice_discount` / `invoice_discount_mode` / `invoice_discount_rate` changes.
- Line `total` uses `formatLineTotal(lineNet - headerShare, currentRoundingMode)` so per-supplier rounding is preserved.

**Save payload**
- Line items persist `discount_mode`, `discount_rate`, `line_discount_amount`, `header_discount_share`, `net_unit_cost` (plus existing `discount` = `line_discount_amount`).
- Invoice header persists `discount_mode`, `discount_rate`, and `discount` = calculated header $ amount.

---

## Step 4 — `ProcurementInvoicesTab.tsx` (edit view)

Apply the same changes:
- Extend `EditableInvoiceLine` and `editForm` with new fields.
- Load `discount_mode`, `discount_rate`, `line_discount_amount`, `header_discount_share`, `net_unit_cost` when opening edit mode (safe fallbacks for legacy rows).
- Same `% / $` toggle controls on line and header.
- Use shared `recalcAllDiscounts` on every relevant change.
- Footer renders the same summary block.
- Save the new fields on update.

---

## Step 5 — `src/utils/autoCreateGrnFromInvoice.ts`

**Two changes:**

1. **Update the `invoice_line_items` SELECT** to include the new discount columns. The current query selects only specific columns and does not include `net_unit_cost`, so it must be extended:

```ts
.select(
  "id, description, unit, quantity, unit_price, normalized_unit_cost, total, discount, " +
  "product_master_id, accepted_qty, qty_difference, receiving_reason, receiving_note, " +
  "net_unit_cost, line_discount_amount, header_discount_share"
)
```

2. **Use `net_unit_cost` as the GRN cost basis** with fallback for legacy rows:

```ts
const unitCost =
  l.net_unit_cost != null && Number(l.net_unit_cost) > 0
    ? Number(l.net_unit_cost)
    : <existing fallback chain: unit_price → normalized_unit_cost → (total + discount) / qty>;
```

Existing fallback chain stays in place for rows where `net_unit_cost` is null/0 (pre-migration data).

---

## Out of scope (explicitly unchanged)

- `invoiceRounding.ts` existing functions and per-supplier rounding modes.
- Receiving columns (`accepted_qty`, `qty_difference`, `receiving_reason`, `receiving_note`).
- GRN status auto-flip to `disputed`.
- Row highlighting, dispute UI.
- GRN creation trigger flow (only the cost source changes).
- All finance pages, all other procurement pages, sidebar, routing.

---

## Files touched

- Migration: add columns + backfill on `invoice_line_items` and `invoices`.
- `src/utils/invoiceRounding.ts` — add new discount helpers (with zero-subtotal guard in `distributeHeaderDiscount`).
- `src/components/invoices/InvoiceScanner.tsx` — line + header discount UI, state, recalculation, save payload.
- `src/components/procurement/ProcurementInvoicesTab.tsx` — same changes in the edit view.
- `src/utils/autoCreateGrnFromInvoice.ts` — extend SELECT to include new discount columns and switch GRN `unit_cost` source to `net_unit_cost` with fallback.
