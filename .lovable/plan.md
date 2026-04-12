
Root cause found: the screen you’re showing at `/procurement/invoices` is powered by `src/components/procurement/ProcurementInvoicesTab.tsx`, not `src/pages/Invoices.tsx`. The earlier fixes were applied to the wrong edit flow, so this procurement edit screen still has the old logic and narrower layout.

Plan

1. Fix the edit-page line total formula in `src/components/procurement/ProcurementInvoicesTab.tsx`
- Update `calculateEditLineTotal` so it always uses:
  `Purch Qty × Purch. Cost - Discount + Tax`
- Remove the weight-based fallback entirely from that helper
- Update `editSubtotal` to also use Purch Qty and Purch. Cost only
- Make sure `handleSaveEdit` re-saves totals from the recalculated values, not stale manual totals

2. Lock the Total column on the edit page
- Change the edit-page Total input from editable to read-only
- Recompute total only when `quantity`, `unit_price`, `discount`, or `tax_amount` change
- Remove `weight` from the recalc trigger list so the edit table behaves the same as the scanner

3. Apply the same table sizing as the scanner
- Increase the edit table width from `min-w-[1200px]` to match the scanner’s wider layout
- Widen the editable numeric inputs on the edit page to match the scanner sizing
- Keep non-name columns visibly wider so values like `7.77`, `60`, and `330` are fully readable

4. Make long names wrap on the edit page
- Replace the read-only Internal Name input with a styled wrapping block like the scanner uses
- Keep the External Name column wide and ensure long names can display without being visually cramped

5. Keep the rest of the edit view aligned with the scanner behavior
- Mirror the same visual treatment for read-only PM-derived cells
- Verify subtotal and total at the bottom of the edit screen come from the corrected line totals

Why the second line is wrong
- In the procurement edit component, the total helper still uses `weight` first:
  `weight > 0 ? weight * price : qty * price`
- That means any populated weight can override Purch Qty, which is exactly opposite to your requirement
- The same component also still allows manual editing of Total, so incorrect values can persist

Files to update
- `src/components/procurement/ProcurementInvoicesTab.tsx`

Technical notes
- Current buggy helper:
  `calculateEditLineTotal(...)` still includes `weight`
- Current buggy subtotal:
  `editSubtotal` still includes `weight`
- Current layout mismatch:
  edit table is still `min-w-[1200px]`
- Current wrapping mismatch:
  Internal Name is still rendered as a single-line `<Input>`
- Current override problem:
  Total is still editable in the procurement edit table

Expected result after implementation
- Second line item total will be calculated from Purch Qty and Purch. Cost only
- Edit Invoice view will visually match the scanner for widths and readability
- Long product names will wrap
- Users won’t be able to manually break totals in the edit table
