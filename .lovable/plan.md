

## Problem

Two issues cause products to not appear in the invoice scanner autocomplete:

1. **Missing `product_suppliers` entries**: SKU `1120602` (Barilla Linguine) exists in `product_master` with its external_sku, supplier, and supplier_product_name, but has NO corresponding row in `product_suppliers`. The data assembly code (ProcurementInvoicesTab lines 73-86) falls back to empty strings for these fields when no supplier entry exists.

2. **Autocomplete filter**: `ProductAutocomplete` (line 47) filters out any product where `supplier_product_name` is empty: `.filter((p) => p.supplier_product_name)`. So products without `product_suppliers` entries are invisible.

## Solution

### 1. Fix data assembly in `ProcurementInvoicesTab.tsx` (lines 47-91)

Update the `product_master` query to also fetch `external_sku`, `supplier_product_name`, `supplier`, and `purchase_unit_cost`. In the `else` branch (no supplier entries), use the product_master's own fields as fallback instead of empty strings:

```typescript
// Query now includes fallback fields
supabase.from("product_master").select("id, internal_sku, internal_product_name, purchase_unit, stock_uom, stock_qty, external_sku, supplier_product_name, supplier, purchase_unit_cost")
```

```typescript
// else branch uses PM's own data as fallback
entries.push({
  id: p.id,
  internal_sku: p.internal_sku,
  external_sku: p.external_sku || "",
  internal_product_name: p.internal_product_name,
  supplier_product_name: p.supplier_product_name || p.internal_product_name || "",
  purchase_unit_cost: p.purchase_unit_cost ?? 0,
  supplier: p.supplier || "",
  purchase_unit: p.purchase_unit || "",
  stock_uom: p.stock_uom || "",
  stock_qty: p.stock_qty ?? 1,
});
```

### 2. Update `ProductAutocomplete.tsx` filter (line 47)

Make the filter more lenient -- allow products that have either a `supplier_product_name` OR an `internal_product_name`, so no valid product is excluded:

```typescript
.filter((p) => p.supplier_product_name || p.internal_product_name)
```

When searching by name, also search against `internal_product_name` as a fallback.

### Files to modify
- `src/components/procurement/ProcurementInvoicesTab.tsx` -- expand PM query and fix fallback assembly
- `src/components/invoices/ProductAutocomplete.tsx` -- relax filter to include products without supplier-specific names

No database changes needed.

