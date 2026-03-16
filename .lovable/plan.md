

## Plan: Add Base Qty and L2 Category columns to Product Master table

### What
Add two missing columns to the Product Master table view:
- **L2 Category** (`level2_category`) — insert between L1 Category and L3 Category
- **Base Qty** (`base_unit_qty`) — insert after Base Unit column

### Changes
**`src/components/procurement/ProductMasterTab.tsx`**
- Add `{ key: "level2_category", label: "L2 Category", w: "w-[100px] hidden lg:table-cell" }` between L1 and L3 category columns
- Add `{ key: "base_unit_qty", label: "Base Qty", w: "w-[70px] hidden md:table-cell" }` after the base_unit_type column
- Add corresponding `<td>` cells in the table body for both new columns
- Update the colspan for the empty-state row

No database or hook changes needed — both fields are already fetched and available in the data.

