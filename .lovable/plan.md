# Items Master: Stock Movement Flag + Supplier Refund Items

Add a `creates_stock_movement` boolean to `product_master` so invoice lines for non-stock items (refunds, deposits, OpEx) skip GRN inventory creation. Seed a standard set of supplier refund items per tenant.

## 1. Migration: add column + backfill

- `ALTER TABLE public.product_master ADD COLUMN creates_stock_movement boolean NOT NULL DEFAULT true`
- Backfill: `true` for COGS, `false` for OpEx and all Asset treatments

## 2. Migration: tenant-scoped inventory aggregates RPC

Replace `get_inventory_aggregates(p_tenant_id uuid)` so it joins `product_master` and filters out:
- `financial_treatment ILIKE 'Asset%'`
- `creates_stock_movement = false`

Grant EXECUTE to `authenticated, service_role`. (I'll verify the current signature before replacing.)

## 3. `src/hooks/useProductMaster.ts`

- Add `creates_stock_movement: boolean` to `ProductMasterItem`
- No other changes — `fetchAllRows("product_master", "*", …)` already returns the new column, and `createProduct`/`updateProduct` spread the full form object so the field flows through automatically

## 4. `src/components/procurement/ProductMasterTab.tsx`

- Add `creates_stock_movement: true` to `EMPTY_FORM`
- Add `creates_stock_movement: boolean` to `FlatRow`; populate in both branches of the `flatRows` useMemo with `p.creates_stock_movement ?? true`
- In the edit/create dialog, add a `Switch` row beneath the `financial_treatment` Select labelled "Creates stock movement" with helper text
- Extend the `financial_treatment` `onValueChange` to also set `creates_stock_movement = (v === "COGS")` — user can still override manually after
- In the table row, when `row.financial_treatment === "COGS" && !row.creates_stock_movement`, render a muted "No stock" badge next to the treatment badge
- Add `creates_stock_movement` (label "Creates Stock Movement") to the CSV export columns

## 5. `src/utils/autoCreateGrnFromInvoice.ts`

- Invoice-line select already includes `net_unit_cost`, `line_discount_amount`, `header_discount_share`, `product_master_id` — leave as-is
- After loading lines, fetch `{ id, creates_stock_movement, financial_treatment }` from `product_master` for the line product IDs and build a Map
- Compute `hasDispute` across **all** lines (refunds with qty diffs still flip status to disputed)
- **Always create the `goods_received_notes` header row and always update `invoices.grn_id`**, regardless of whether any lines are stock-bearing
- Build the `grn_items` insert payload from only the lines whose product has `creates_stock_movement !== false` (unknown product defaults to included). If the filtered list is empty, skip just the `grn_items` insert — the header and the `invoices.grn_id` link still happen
- Cost basis stays `net_unit_cost` when > 0, else falls back to `unit_price` (existing fallback chain kept)

## 6. Refund-items seed banner in `ProductMasterTab.tsx`

- Show a dismissible `Alert` at the top of the page when both:
  - `localStorage.getItem("refund_seed_dismissed") !== "true"`
  - No existing products with `internal_sku` starting with `REF-`
- "Add refund items" inserts 7 standard rows (REF-0001…REF-0007) via the existing `createProduct` path (tenant-scoped), each: `financial_treatment="COGS"`, `creates_stock_movement=false`, `level1_category="Supplier Refunds"`, `accounting_category="purchases"`, `status="Active"`, numeric fields `0`, strings `""`
- "Not now" writes `refund_seed_dismissed=true` to localStorage and hides the banner
- After seeding, call `fetchProducts()`

## What does NOT change

`FINANCIAL_TREATMENTS`, `plSectionFor`, `product_suppliers`, `CategoryCascadeSelect`, `UomSelect`, Invoice Scanner, Invoice Edit, finance pages, Deposit Ledger, Stock Counts, sidebar/routing.

## Verification

1. Build passes
2. Create a new product, toggle treatment between COGS/OpEx/Asset — switch follows; manual override sticks
3. Invoice with one COGS stock line + one REF-0001 line: GRN created with one `grn_items` row, invoice links to GRN
4. Invoice with only REF-* lines: GRN header still created, `grn_items` empty, `invoices.grn_id` populated
5. `get_inventory_aggregates` for the current tenant returns no rows for REF-* or Asset items
