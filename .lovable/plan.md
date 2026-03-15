

## Plan: Clean Database + Replace Inventory Tab

### 1. Database Cleanup

Delete all non-Beverage World data in this order (respecting foreign keys):

```sql
-- Delete line items for non-Beverage World invoices
DELETE FROM invoice_line_items WHERE invoice_id IN (
  SELECT id FROM invoices WHERE supplier_id != '45e4cf56-b7eb-4144-9332-f5e83b4cbc65'
);

-- Delete payments for non-Beverage World invoices
DELETE FROM invoice_payments WHERE invoice_id IN (
  SELECT id FROM invoices WHERE supplier_id != '45e4cf56-b7eb-4144-9332-f5e83b4cbc65'
);

-- Delete non-Beverage World invoices
DELETE FROM invoices WHERE supplier_id != '45e4cf56-b7eb-4144-9332-f5e83b4cbc65';

-- Delete non-Beverage World suppliers
DELETE FROM suppliers WHERE id != '45e4cf56-b7eb-4144-9332-f5e83b4cbc65';

-- Clear old inventory tables (they'll be replaced)
DELETE FROM inventory_counts;
DELETE FROM inventory_periods;
DELETE FROM inventory_items;
```

### 2. Replace Inventory Tab

Remove the old `Inventory.tsx` page and `useInventoryData.ts` hook entirely. Create a new **Inventory On Hand** component that derives its data from `product_master` + `invoice_line_items`.

**Concept**: No separate `inventory_items` table needed. The inventory is computed from:
- **Items**: All active `product_master` entries
- **Qty on hand**: Sum of `invoice_line_items.quantity` for each matched `product_master_id`
- **Weighted Average Cost**: Total spend / total qty purchased (from invoice line items)
- **Supplier Value**: `product_master.unit_cost × qty_on_hand` (the supplier's listed price)

**New component**: `src/components/procurement/InventoryOnHandTab.tsx`

**Columns**:
| Internal SKU | Product Name | Category | Qty On Hand | Unit | Avg Cost | Cost Value | Supplier Unit Price | Supplier Value |

Where:
- **Avg Cost** = sum of `invoice_line_items.total` / sum of `invoice_line_items.quantity` per product_master_id (weighted average of actual purchases)
- **Cost Value** = Avg Cost × Qty On Hand (accounting cost basis)
- **Supplier Unit Price** = `product_master.unit_cost`
- **Supplier Value** = Supplier Unit Price × Qty On Hand

**Features**:
- Summary cards: Total SKUs, Total Cost Value, Total Supplier Value
- Search by name/SKU
- Category filter (Level 1)
- Sortable columns
- Footer row with totals for Cost Value and Supplier Value

### 3. File Changes

| File | Action |
|------|--------|
| `src/pages/Inventory.tsx` | Delete or gut entirely |
| `src/hooks/useInventoryData.ts` | Delete (no longer needed) |
| `src/components/procurement/InventoryOnHandTab.tsx` | **Create** — new component |
| `src/pages/Procurement.tsx` | Replace lazy Inventory import with new InventoryOnHandTab |
| `src/App.tsx` | Remove `/inventory` route if it exists |

### Technical Notes

- The new tab queries `product_master` joined with aggregated `invoice_line_items` data (grouped by `product_master_id`)
- Weighted average cost recalculates on each load — no stored state needed
- Items with no purchases show qty=0, cost=0, supplier value from product_master.unit_cost
- This is a read-only view; stock adjustments happen through invoice uploads

