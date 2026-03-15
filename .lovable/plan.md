

## Plan: Menu Costing Tab under Procurement

### Database Changes (3 new tables)

**1. `menu_items`**
- `id` uuid PK
- `name` text NOT NULL
- `category` text NOT NULL DEFAULT ''
- `theoretical_cost` numeric NOT NULL DEFAULT 0 (auto-updated via code)
- `status` text NOT NULL DEFAULT 'Active'
- `created_at`, `updated_at` timestamps
- RLS: authenticated can read, admin/manager can manage

**2. `menu_item_ingredients`**
- `id` uuid PK
- `menu_item_id` uuid FK → menu_items(id) ON DELETE CASCADE
- `product_master_id` uuid FK → product_master(id)
- `sku` text (denormalized from product_master for display)
- `description` text (denormalized)
- `quantity_used` numeric NOT NULL DEFAULT 0
- `unit_used` text NOT NULL DEFAULT 'gms'
- `reference_cost` numeric NOT NULL DEFAULT 0 (from product_master.unit_cost)
- `line_cost` numeric NOT NULL DEFAULT 0 (quantity_used × reference_cost)
- `created_at` timestamp
- RLS: same pattern

**3. `menu_item_pricing`**
- `id` uuid PK
- `menu_item_id` uuid FK → menu_items(id) ON DELETE CASCADE
- `price_type` text NOT NULL (e.g. "Regular", "Taco Tuesday")
- `selling_price` numeric NOT NULL DEFAULT 0
- `gross_profit` numeric NOT NULL DEFAULT 0 (selling_price - theoretical_cost)
- `food_cost_pct` numeric NOT NULL DEFAULT 0 (theoretical_cost / selling_price)
- `created_at` timestamp
- RLS: same pattern

### Seed Data
Insert 1 sample "Beef Taco" menu item with ingredient lines linked to existing Product Master items (flour tortilla, ground beef, etc.) and 4 pricing types (Regular, Taco Tuesday, Happy Hour, Delivery).

### Frontend Changes

**New tab in `src/pages/Procurement.tsx`**
- Add "Menu Costing" tab with `UtensilsCrossed` icon

**New hook: `src/hooks/useMenuCosting.ts`**
- CRUD for menu_items, menu_item_ingredients, menu_item_pricing
- Auto-calculate theoretical_cost as sum of ingredient line_costs
- Auto-calculate gross_profit and food_cost_pct from pricing

**New component: `src/components/procurement/MenuCostingTab.tsx`**
- Table listing all menu items with name, category, theoretical cost, status
- Click a menu item to open a detail panel/dialog with two sections:
  - **Recipe / Ingredients**: table of ingredient lines with add/edit/delete, product master picker, quantity, unit, reference cost, line cost
  - **Pricing Types**: table of price types with selling price, auto-calculated gross profit and food cost %
- Add/edit/delete menu items
- Clear label: "Theoretical Cost — for pricing analysis only"

### Calculation Logic (all in frontend)
- `line_cost = quantity_used × reference_cost`
- `theoretical_cost = SUM(line_costs)` for all ingredients
- `gross_profit = selling_price - theoretical_cost`
- `food_cost_pct = theoretical_cost / selling_price × 100`

### Notes
- No connection to inventory, COGS, or accounting
- Structured with proper FKs for future expansion
- Follows existing patterns (hook + tab component, same RLS approach)

