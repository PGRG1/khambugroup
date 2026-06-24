## Supplier Pricing Page

Build a new procurement page that compares Items Master prices against actual GRN receipt prices, flags price drift, and shows per-item price history.

### 1. Sidebar
In `src/components/AppSidebar.tsx`, remove `disabled: true` from the Supplier Pricing entry in `procurementAnalysis`.

### 2. Route
In `src/App.tsx`, import `SupplierPricing` and add:
```
<Route path="/procurement/supplier-pricing" element={<AdminRoute><SupplierPricing /></AdminRoute>} />
```

### 3. New page `src/pages/procurement/SupplierPricing.tsx`

**Data fetch (tenant-scoped via `useActiveTenant` + `fetchAllRows`):**
- `product_master` → filter to stock-bearing COGS items (`creates_stock_movement !== false`, not Asset)
- `grn_items` joined to `goods_received_notes` using the **explicit FK hint `goods_received_notes!grn_id`** (avoids the PostgREST relationship conflict from earlier prompts); keep only `status = 'confirmed'`
- `suppliers` → name lookup

**Per-item computation (`ItemPriceData`):**
- masterPrice = `purchase_unit_cost`
- lastGrnPrice / lastGrnDate / lastGrnSupplier from most recent confirmed GRN
- avgGrnPrice = avg of last 3 GRN unit_costs
- priceDrift % = (last − master) / master × 100
- priceHistory array (date, price, supplier, grnId)
- Derived: `alertItems` (|drift| ≥ threshold), `staleItems` (no master price or no GRN)

**Layout:**

- **Header**: title + subtitle, right-side filters (Category, Supplier, Drift threshold ±3/5/10%).
- **Section 1 — KPI cards (4)**: Items with drift, Biggest increase, Biggest decrease, Master price gaps. Amber/red/green tints per spec.
- **Section 2 — Price drift alerts table**: only when alerts exist; amber banner if any drift > 20%. Columns: SKU, Item, Category, Master, Last GRN, Drift (↑/↓ red/green), Avg(3), Last received + supplier, Action. "Update master" button writes `product_master.purchase_unit_cost = lastGrnPrice` (tenant-scoped update) and refreshes.
- **Section 3 — Price history search + chart**: Search box (name/SKU) → dropdown of matches → on select show header line, ComposedChart with `ReferenceLine` for master price (dashed amber) + teal Line for GRN prices, and a 5-box stats strip (Min, Max, Avg, Range $/%, Receipts). Empty state when nothing selected.
- **Section 4 — All items table**: Toggles (only with GRN history / only with drift). Columns: SKU, Item, Category, Master, Last GRN, Drift, Last received, GRN count, Action (History → opens right-side Sheet with same chart + stats for that item). Default sort by drift desc.

**Styling**: `card-glass rounded-xl`, primary-coloured table headers, row hover with 3px left border (red/green by drift sign), red/green/muted drift text, reuse `tooltipStyle/tooltipItemStyle/tooltipLabelStyle` pattern from `ProcurementDashboardTab.tsx`.

### Out of scope
No DB migration, no changes to `ProductMasterTab`, GRN flow, or other procurement pages beyond the sidebar entry and route.
