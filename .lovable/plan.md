

## Plan: Enable duplicate SKU detection in Edit Product mode

### Problem
When editing a product, the duplicate Internal SKU detection is deliberately disabled. The user wants the same warning behavior as when creating a new product — if they change the Internal SKU to one that already exists, they should see the amber caution alert.

### Changes

**File: `src/components/procurement/ProductMasterTab.tsx`**

1. **Update the duplicate SKU detection `useEffect` (line 179-186)**: Remove the early return for `editingProductId`. Instead, when editing, check for duplicates but exclude the current product's own SKU (using `originalSku` to compare). If the SKU matches a *different* product, show the warning.

2. **Show the duplicate alert in edit mode (line 503)**: Remove the `!editingProductId` condition so the amber warning appears during both create and edit flows.

3. **Update `attemptSave` (line 242-248)**: Allow the duplicate confirmation dialog to trigger during edits as well (when the SKU was changed to match another product). The existing merge/reassign logic on lines 281-288 already handles this case correctly, so the confirmation dialog simply acts as an extra safety step.

### Technical detail
- The `originalSku` state (line 62) already tracks the SKU value when editing began, which we use to distinguish "same SKU as before" from "changed to a different existing SKU."
- The existing merge-on-SKU-match logic (lines 281-288) will continue to handle the actual reassignment.

