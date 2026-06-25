## Add "Use invoice price" shortcut in Acc. price cell

Edit two files only — pure UI, no state/logic/save changes.

### `src/components/invoices/InvoiceScanner.tsx`
In the Acc. price `<td>`:
1. Remove the "Master $X.XX" and "Inv $X.XX" chips added previously.
2. In the two non-free-unit branches (master_price == null and master_price != null), add at the very top of the cell, before the input:
   ```tsx
   <button
     type="button"
     onClick={() => updateLineAcceptedPrice(i, line.unit_price)}
     className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 mb-0.5"
     title="Copy purchase cost to accepted price"
   >
     <ArrowRight className="h-2.5 w-2.5" /> Use invoice price
   </button>
   ```
3. Skip the free-unit branch (price always 0).
4. Leave the "Update master → $X" button and everything else untouched.

### `src/components/procurement/ProcurementInvoicesTab.tsx`
Same change, but handler is `updateEditLineAcceptedPrice(index, line.unit_price)`. Same three rules: remove Master/Inv chips, add button to both non-free-unit branches, skip free-unit branch, keep Update master button.

### Notes
- `ArrowRight` already imported in both files.
- No changes to state, handlers, save logic, or any other cell.
