## Items Master — Supplier Deal Conditions

### 1. Database migration
Create `public.item_supplier_deals` with the requested columns, plus standard Lovable Cloud conventions:
- `tenant_id` FK → `tenants(id)` on delete cascade
- `product_id` FK → `product_master(id)` on delete cascade
- `supplier_id` FK → `suppliers(id)` on delete cascade
- `deal_type text` default `'buy_x_get_y_free'` (CHECK in list)
- `buy_qty numeric(10,2)`, `free_qty numeric(10,2)` — both > 0 via CHECK
- `is_active boolean` default true, `notes text`
- Standard `id`, `created_at`, `updated_at` + update trigger
- `UNIQUE (product_id, supplier_id, deal_type)`

GRANTs: `SELECT, INSERT, UPDATE, DELETE` to `authenticated`; `ALL` to `service_role`.

Enable RLS with the project's standard pattern (used by `product_master`, `suppliers`, etc.):
```sql
CREATE POLICY tenant_select ON public.item_supplier_deals
  FOR SELECT USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY tenant_write ON public.item_supplier_deals
  FOR ALL USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));
```
(Note: the prompt referenced `user_profiles`, which doesn't exist in this project — using the established `user_has_tenant` helper instead, matching every other procurement table.)

### 2. UI — `src/components/procurement/ProductMasterTab.tsx`
Inside the existing Add/Edit Product slide-out (around lines 944–1221), add a new **"Supplier deals"** section below the existing supplier/pricing block. Visible only when `editingProductId` is set (so the row already exists in DB to attach deals to). For the Add flow, render a muted hint: "Save the item first to add supplier deals."

Section layout:
- Header row: `Supplier deals` + right-aligned `[+ Add deal]` button
- Active deals list (cards):
  - `[Supplier name]   Buy {buy_qty} {purchase_unit}   get {free_qty} {purchase_unit} free   Effective: HK$ X.XX / {purchase_unit}   [Edit] [Delete]`
  - `effective_unit_cost = (buy_qty × purchase_unit_cost) / (buy_qty + free_qty)` using `product_master.purchase_unit_cost`, formatted via `@/utils/format`
- Empty state: muted "No deals configured"

### 3. Add/Edit Deal dialog — new component `src/components/procurement/SupplierDealDialog.tsx`
Fields:
- **Supplier** — `Select` listing tenant suppliers (reuse data already loaded in ProductMasterTab; sanitize empty ids per Radix constraint). Required.
- **Deal type** — read-only label `Buy X get Y free`.
- **Buy qty** — numeric > 0.
- **Free qty** — numeric > 0.
- **Notes** — optional text.
- **Active** — `Switch`, default on.
- Live read-only display: `Effective price: HK$ X.XX per {stock UOM}` and `Saving per deal: HK$ X.XX` (= `free_qty × purchase_unit_cost`).

Save → `tenantUpsert('item_supplier_deals', tenantId, …, { onConflict: 'product_id,supplier_id,deal_type' })`.
Validation: required supplier, both qtys > 0, duplicate (supplier + deal_type) shows inline error "A deal with this supplier already exists" (catch unique-violation or pre-check the local list).

### 4. Delete behavior
Soft delete via `update { is_active: false }` (keeps row, frees up the unique slot only if we exclude inactive from the list — which we do; re-adding the same supplier later will hit the unique constraint, so deletion will also clear the prior row by hard-deleting inactive duplicates on insert, or we add `WHERE is_active` to the unique index).

Implementation choice: keep schema simple with the plain unique constraint, and on soft-delete also hard-delete any *inactive* row for the same (product, supplier, deal_type) when creating a new one. UI only ever shows `is_active = true`.

### 5. Out of scope
No changes to the main Items Master table columns, filters, CSV export, or navigation. Only the edit panel gains the new section, plus the new dialog component and migration.

### Files touched
- `supabase/migrations/<new>.sql` — new table + RLS + GRANTs
- `src/components/procurement/ProductMasterTab.tsx` — render Supplier deals section in edit panel, load deals for current product, wire dialog
- `src/components/procurement/SupplierDealDialog.tsx` — new dialog component
