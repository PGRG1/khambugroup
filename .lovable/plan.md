

## Fix: Invoice Line Total Calculation, Column Widths, and Dropdown Cropping

### Problem 1: Total calculated incorrectly
Both `InvoiceScanner.tsx` (line 563) and `Invoices.tsx` (line 416) use `weight` in the total calculation: `w ? w * price : qty * price`. The user wants total to **always** be `qty * price - discount + tax`, ignoring weight.

### Problem 2: Input columns too narrow
Numeric inputs for UOM, Qty, Cost, etc. still appear cramped. All input columns (except Name columns) should be wider so values are fully visible.

### Problem 3: Long product names get cut off
Name columns (Internal Name, External Name) should wrap text instead of truncating.

### Problem 4: Autocomplete dropdown cropped for bottom rows
The `ProductAutocomplete` dropdown opens downward (`top-full`), so for the last row(s) in the table it gets clipped by the container's `overflow-x-auto`. Fix by detecting position and flipping the dropdown upward when near the bottom.

### Changes

**`src/components/invoices/InvoiceScanner.tsx`**:
- Line 563: Change `(w ? w * price : qty * price)` → `(qty * price)` so total always uses Purch. Qty × Purch. Cost
- Widen the table `min-w` from `1350px` to `1500px`

**`src/pages/Invoices.tsx`**:
- Line 416: Same fix — change `(w ? w * price : qty * price)` → `(qty * price)`
- Line 1146: Same fix in the subtotal calculation at the bottom
- Widen the edit table `min-w` from `1200px` to `1500px`

**Both files — column width tweaks**:
- Increase width on UOM columns (`w-[75px]` → `w-[85px]`)
- Ensure all numeric inputs have `min-w-[80px]`
- Add `whitespace-normal break-words` to the Internal Name and External Name `<td>` cells so long names wrap

**`src/components/invoices/ProductAutocomplete.tsx`**:
- Add logic to detect if the dropdown would overflow the viewport bottom
- If so, render the dropdown **above** the input (`bottom-full mb-1`) instead of below (`top-full mt-1`)
- Change the container overflow on parent tables from `overflow-x-auto` to also allow `overflow-y-visible` where needed, or use a portal/fixed position approach

