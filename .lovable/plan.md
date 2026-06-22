# Add GRN Receiving Columns to the Invoice Editor

Scope: edit only `src/components/procurement/ProcurementInvoicesTab.tsx` (the Edit-Invoice view at lines ~700–916). `InvoiceScanner.tsx` is not touched. Visual behavior, validation, and persistence must match the Scanner exactly.

## 1. Extend the editable line shape

In `EditableInvoiceLine` (and `emptyEditLine`) add:
- `accepted_qty: string` — default `"1"` for new lines.
- `accepted_qty_touched: boolean` — default `false`.
- `receiving_reason: string` — default `"matched"`.
- `receiving_note: string` — default `""`.

`hydrateEditLine` populates them from the saved line:
- `accepted_qty = String(line.accepted_qty ?? line.quantity ?? "1")`
- `accepted_qty_touched = line.accepted_qty != null`
- `receiving_reason = line.receiving_reason || (diff === 0 ? "matched" : "")`
- `receiving_note = line.receiving_note || ""`

Reuse the same `RECEIVING_REASONS` list (14 options, identical order), the same `NEGATIVE_AMBER_REASONS` / `NEGATIVE_RED_REASONS` / `POSITIVE_GREEN_REASONS` sets, and the same `computeReceivingTint` helper. To keep the rule "do not change InvoiceScanner.tsx", duplicate these three constants and the helper locally in `ProcurementInvoicesTab.tsx` (one-to-one copy).

## 2. Quantity / accepted-qty linkage

Update `updateEditLine`:
- When `field === "quantity"` and `!line.accepted_qty_touched`, mirror the new value into `accepted_qty`.
- After updating either `quantity` or `accepted_qty`, recompute `diff = acc - qty`. If diff is 0, force `receiving_reason = "matched"`. If diff becomes non-zero and the previous reason was `"matched"` (or empty), clear it to `""`.

Add `updateEditLineReceiving(idx, field, value)` for the three receiving fields with the same touched-flag and reason-reset behavior as the Scanner's `updateLineReceiving`.

## 3. Four new table columns

Insert between Stock Qty and Purch. Cost (between current lines 779 and 780), with the same widths used in the Scanner:
1. **Accepted Qty** — 90px, numeric input, min=0, decimals allowed.
2. **Difference** — 80px, read-only display. Color: muted for 0, red for negative, green for positive. Font-mono.
3. **Reason** — 160px. When diff is 0 render a muted "Matched" chip (no dropdown). When diff ≠ 0 render a native `<select>` with all 14 `RECEIVING_REASONS` plus an empty placeholder. A small red dot when the value is empty.
4. **Note** — 140px, compact input, `maxLength=500`. Red dot when reason is `"other"` and note is empty.

Update the header cells and the `min-w-[1350px]` value (bump to `min-w-[1700px]`) so the new columns fit.

Row highlight: replace the existing `rowClass` with a composite that keeps the current unmatched/price-changed treatments but also applies `computeReceivingTint(line)` background/border when present (receiving tint takes precedence on the inline-style row, matching the Scanner).

## 4. Status auto-flip + dispute warning

Compute, on each render of the editor:
```
hasDispute = editLines.some(l => (parseFloat(l.accepted_qty || l.quantity) - parseFloat(l.quantity || "0")) !== 0)
missingReason = lines with non-zero diff and empty reason
missingNote   = lines with reason "other" and empty trimmed note
```

`useEffect` keyed on `hasDispute`:
- When `hasDispute` becomes true and `editForm.status !== "disputed"`, stash the prior status in a `previousStatusRef` and set `editForm.status = "disputed"`.
- When `hasDispute` becomes false and `editForm.status === "disputed"`, restore from the ref (default `"unpaid"`).

When `hasDispute`, render an inline amber banner above the table: "Invoice disputed — quantity differences must be resolved before saving."

## 5. Save validation + persistence

`handleSaveEdit`:
- Disable **Save Changes** when `missingReason > 0` OR `missingNote > 0` (Close button remains enabled).
- In the `mappedLines` mapper, add:
  - `accepted_qty: parseFloat(line.accepted_qty) || 0`
  - `qty_difference: (parseFloat(line.accepted_qty) || 0) - (parseFloat(line.quantity) || 0)`
  - `receiving_reason: qty_difference === 0 ? "matched" : (line.receiving_reason || null)`
  - `receiving_note: (line.receiving_note || "").trim() || null`

`useInvoiceData.updateInvoice` already forwards the line array via `insert(items as any)`, so these extra keys persist without further changes. The `InvoiceLineItem` interface in `useInvoiceData.ts` will be extended with the four optional fields (`accepted_qty?: number | null`, `qty_difference?: number | null`, `receiving_reason?: string | null`, `receiving_note?: string | null`) so TypeScript reads them when `fetchLineItems` returns them — that's the only edit outside `ProcurementInvoicesTab.tsx`.

## Out of scope

InvoiceScanner.tsx, header fields, summary chips, all existing columns/inputs, footer totals, extraction/matching/pricing/tax logic, item status badges, the Add Line / Close buttons, the invoice list table, the GRN backend writer.
