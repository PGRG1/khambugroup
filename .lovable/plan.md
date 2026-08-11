# Price history panel in the Scan Invoice review screen

Add an in-place price history overlay for each matched line item. Everything happens on top of the Scan Invoice screen — no routing, no new tabs, and the invoice form keeps every unsaved edit because the panel is just a modal rendered alongside the existing table.

## Trigger

- In the item name cell of the line items table (the leftmost matched-name column, `InvoiceScanner.tsx` around the `matched_internal_name` render), add a 16px clock-with-arrow icon button (`History` from lucide-react), muted colour, directly to the right of the name.
- Renders only when the line is linked to a supplier item and that item has at least 2 prior purchases.
- Clicking the icon or the item name opens the panel. Icon button gets `aria-label="View price history"`.
- No other change to column widths, row heights, or table layout.

## Panel — primary state

Centred modal (shadcn `Dialog`), max width 720px, auto height, internal scroll past 10 rows. Closes on X, Esc, and outside click; closing simply unmounts the overlay so the form state underneath is untouched.

1. Header: item name 15px/500; subtitle 13px secondary "{supplier name} · {venue} · last {n} purchases"; X top-right.
2. Stat strip: 4 equal cards (Master price, This invoice, 6-mo average, Change vs last) — surface background, no border, 8px radius, 10px/12px padding, 12px muted label over 18px/500 mono value. "This invoice" and "Change vs last" use warning tokens when the variance exceeds the existing threshold; otherwise default text.
3. Trend chart: full width, 90px tall, inline SVG (not recharts, to keep it axis-free). Dashed horizontal master-price line (3px/4px dash, strong border token) with an 11px muted "master $x" label above its left end. Solid 2px blue polyline oldest→newest with 3.5px filled points; current invoice point 5px in amber with an 11px muted "now" label beneath. Y-scale is padded around the value range so an all-identical history renders as a flat line.
4. History table: Date 88px, Invoice flex, Qty 52px right, Unit 66px right, Δ 62px right. 12px muted header with a 0.5px bottom border; 13px rows, 10px vertical padding, 0.5px separators, none after the last row. Current invoice row uses warning background, invoice number in warning colour with an 11px " · current" suffix and no drill-in. Historical invoice numbers are accent-coloured buttons with a 13px chevron-right. Δ = % change vs the next-older purchase, warning colour when positive and past the threshold, muted em-dash when unchanged or oldest.
5. Action footer: only when the invoice price differs from master. 0.5px top border, two equal secondary buttons, 8px gap: "Keep master at ${master}" and "Update master to ${invoice price}". Both close the panel; the update button calls the existing `handleUpdateMaster(lineIdx)` in `InvoiceScanner.tsx` — no duplicated mutation logic.

## Panel — secondary state (invoice drill-in)

Same overlay, content swaps in place:
- Back row: chevron-left + "Back to price history", restoring the primary state and its scroll offset.
- Invoice summary: supplier, invoice number, invoice date, venue, status, doc total.
- Compact read-only line items table (item name, qty, unit cost, line total) with the row for the current SKU highlighted.
- If the invoice has a `file_url`, a collapsible source-document section rendered inline in this same state (signed-URL image/PDF render, same approach as the existing attachment viewer) — never a new tab.
- X and Esc close the whole panel from either state.

## Data

- History is keyed to the supplier item, not to names or fuzzy matching at read time. `invoice_line_items` has no `supplier_entry_id` column, so the panel resolves the line's `supplier_entry_id` to its `product_suppliers` row and then selects historical lines where `invoice_line_items.product_master_id` equals that row's `product_master_id` and the parent `invoices.supplier_id` is that row's supplier. Both queries are filtered by `tenant_id` and run under existing RLS.
- Last 6 purchases, most recent first, per row: invoice date, invoice number, invoice id, accepted qty (`accepted_qty` falling back to `quantity`), unit purchase cost (`accepted_price` falling back to `unit_price`).
- The in-progress invoice is prepended from live form state only — nothing is written to the database.
- Fetch runs when the panel opens (not on table render) and is cached per line for the session.

## Technical notes

- New file `src/components/invoices/PriceHistoryPanel.tsx` holding both states plus a small `useSupplierPriceHistory` fetch hook in the same file.
- Threshold: the existing row flagging compares accepted/invoice price against `master_price` with a `> 0.01` absolute epsilon (`InvoiceScanner.tsx` lines 446, 580, 1160, 1458). That value is extracted once into an exported constant and reused by both the table and the panel — no new threshold is introduced.
- Colours through design tokens only (`text-muted-foreground`, `bg-muted`, warning/amber and accent tokens already in use in this table); verified against dark mode.
- All numeric values use the mono font class already used for figures.
- Out of scope, explicitly not built: venue filtering, cross-supplier comparison, inventory SKU comparison.
- No change to save, approve, or journal posting logic.
