## Redesign Acc. price cell in both invoice views

Pure UI redesign in two files. No state, handlers, or save logic changes.

### Files
- `src/components/invoices/InvoiceScanner.tsx`
- `src/components/procurement/ProcurementInvoicesTab.tsx`

### Changes per file

1. **Replace Acc. price cell content** (non-free-unit branches only) with the new IIFE pattern:
   - Computes `matchesInvoice` and `differsFromMaster` locally.
   - Row 1: `<Input>` + conditional blue arrow button (shown when accepted ≠ invoice).
   - Input gets amber border when `differsFromMaster`.
   - Row 2 subtext: `= invoice price` / `Master: $X.XX` + Update master link / `No master price`.
   - Collapses the previous two-branch (`master_price == null` vs `!= null`) split into one unified renderer.

2. **Leave free-unit branch untouched** (zero-price deal lines).

3. **Keep `Eff: $X.XX` label** for deal lines exactly where it currently sits.

4. **Add "Accept all invoice prices" bulk link** immediately before the line items `<table>` (after any warning banners):
   - Scanner: iterates `current?.line_items`, calls `updateLineAcceptedPrice(i, line.unit_price)`, skips free-unit lines.
   - Procurement tab: iterates `editLines`, calls `updateEditLineAcceptedPrice(index, line.unit_price)`, skips free-unit lines.

5. **Remove leftover "Master $X.XX" / "Inv $X.XX" chip buttons** if any remain from prior iterations.

### Handler/index mapping
| Placeholder | Scanner | Procurement tab |
|---|---|---|
| row index | `i` | `index` |
| update accepted | `updateLineAcceptedPrice` | `updateEditLineAcceptedPrice` |
| update master | `handleUpdateMaster(i)` | `handleEditUpdateMaster(index)` |
| updating flag | `updatingMasterIdx` | `updatingMasterIdx` |

### Not touched
State, hydration, save logic, deal-line free-unit branch, `Eff:` label, all other columns, footers, and validation.
