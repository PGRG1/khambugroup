

## Root cause
`BEV-5121` (and 37 other products) has **no `product_suppliers` row** — only the `product_master` row exists. In this case `editingSupplierEntryId` is `null` when the edit dialog opens.

In `ProductMasterTab.tsx` `handleSave` (lines 291-302), the `else` branch only updates `product_suppliers` **if** `editingSupplierEntryId` exists:

```ts
if (editingSupplierEntryId) {
  await supabase.from("product_suppliers").update(supplierLevelFields)...
}
```

So when the user edits supplier-level fields (External SKU, Supplier Product Name, Purchase Unit/Cost, Stock UOM/Qty, Recipe UOM/Qty, Supplier) on an "orphan" product, those edits are **silently dropped**. Only internal fields (name, category, unit, notes, status) get saved — which is why the user sees "the same old values".

The DB confirms it: `product_master.updated_at` is fresh (the PM row update worked), but no `product_suppliers` row was ever created.

## Fix
In `handleSave`, when editing a product that has no `editingSupplierEntryId`, **create a new `product_suppliers` row** with the form's supplier-level fields (only if the user actually entered any supplier data — i.e., supplier name or external SKU or purchase cost is non-empty). This makes the edit complete and self-healing for the 38 orphan products.

### Change (single file: `src/components/procurement/ProductMasterTab.tsx`)

Replace the `if (editingSupplierEntryId)` block at lines 296-299 with:

```ts
if (editingSupplierEntryId) {
  // Existing path — update existing supplier entry
  const { error: psErr } = await supabase
    .from("product_suppliers")
    .update(supplierLevelFields)
    .eq("id", editingSupplierEntryId);
  if (psErr) console.error("product_suppliers update error:", psErr);
} else {
  // No supplier entry yet — create one if any supplier-level data was entered
  const hasSupplierData =
    supplierLevelFields.supplier ||
    supplierLevelFields.external_sku ||
    supplierLevelFields.supplier_product_name ||
    supplierLevelFields.purchase_unit_cost > 0;
  if (hasSupplierData) {
    const { error: psErr } = await supabase
      .from("product_suppliers")
      .insert({ ...supplierLevelFields, product_master_id: editingProductId });
    if (psErr) console.error("product_suppliers insert error:", psErr);
  }
}
```

### Result
- Editing BEV-5121 (or any of the 38 orphan products) now saves both PM and supplier fields.
- Future edits hit the existing `update` path because the supplier row now exists.
- No DB schema changes. No breaking change to any existing flow.

### Verification
1. Open Product Master, edit BEV-5121, change External SKU + Purchase Cost + Supplier, click Update.
2. Reopen the row → all changes persist.
3. Edit again → the same supplier entry updates in place (no duplicates created).
4. Verify a normal product (with existing supplier entry) still updates correctly.

