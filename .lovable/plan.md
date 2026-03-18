

## Plan: Insert HER-0004 into Product Master

Insert one new product record into the `product_master` table and a corresponding `product_suppliers` entry for "Green Valley".

### Data to insert

**product_master:**
- internal_sku: HER-0004
- internal_product_name: Rosemary
- level1_category: Fresh Produce
- level2_category: Herbs
- level3_category: Rosemary
- purchase_unit: BUNCH
- purchase_unit_cost: 17.00
- base_unit_type: bunch
- base_unit_qty: 1
- cost_per_base_unit: 17.00
- supplier: Green Valley
- status: Active

**product_suppliers:**
- Link to the new product_master record
- supplier: Green Valley
- supplier_product_name: Rosemary (per bunch)
- purchase_unit: BUNCH
- purchase_unit_cost: 17.00

### Implementation
1. Use the data insert tool to insert into `product_master` with `ON CONFLICT (internal_sku) DO NOTHING`
2. Insert corresponding `product_suppliers` row referencing the new product's ID

