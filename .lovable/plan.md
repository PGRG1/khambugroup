No code changes needed. Validation of `src/pages/procurement/SupplierAccount.tsx` confirms `deposit_opening_balances` are correctly merged into the Deposits tab:

1. **Row mapping** (lines 869-881): each opening deposit becomes a `DRow` with `invoiceNo = "Opening"`, `charged = total_value` (with fallback to `quantity × unit_value`), `returned = 0`, `net = total_value`, `isOpening = true`.
2. **Combine + sort** (line 882): invoice deposits and opening deposits concatenated and sorted by date ascending.
3. **Status badge** (line 900): gray "Opening" badge styled `bg-zinc-500/15 text-zinc-300 border-zinc-500/30`.
4. **Totals row** (lines 911-928): `tCharged = invCharged + obCharged` and `tNet = tCharged − tReturned`, so opening deposits flow into both Charged and Net Outstanding totals. Footer renders whenever either source has rows.

Implementation matches the spec — no plan to execute. Approve to close out.