

## Revamp Procurement Dashboard Charts

### What changes

**File: `src/components/procurement/ProcurementDashboardTab.tsx`**

#### 1. Remove the daily/monthly supplier line chart
Delete the entire `<Card>` block (lines 250–284) containing the `LineChart`. The supplier tree view below it stays.

#### 2. Add KPI summary row
Add a row of 4 KPI cards at the top (below the header): **Total Spend**, **Invoice Count**, **Avg Invoice Value**, **Unique Suppliers** — filtered by the selected period.

#### 3. Add "Spend by Supplier" horizontal bar chart
Replace the removed line chart with a horizontal bar chart ranking suppliers by total spend (highest first). Uses the same data as the tree view. Color-coded bars with percentage labels.

#### 4. Add "Spend by Category" charts (L1, L2, L3)
- Fetch `product_master` data on mount (id, level1_category, level2_category, level3_category)
- Join line items → product_master via `product_master_id` to get categories
- **L1 Category**: Donut/pie chart showing top-level category breakdown
- **L2 Category**: Horizontal bar chart, grouped under L1 context
- **L3 Category**: Horizontal bar chart for granular detail
- Unmatched line items (no product_master_id) grouped as "Uncategorized"

#### 5. Improve "Expenses by Product" chart
- Add a gradient fill instead of flat color
- Show top 20 by default with a "Show all" toggle to avoid an impossibly long chart
- Add spend amount labels on bars
- Better truncation of long product names

#### 6. Additional analytics charts (data science perspective)
- **Spend Trend Over Time**: Monthly bar chart of total spend (simple, replaces the complex multi-supplier line chart with a clear single-series view)
- **Top 10 Price Variance Items**: Bar chart showing items with highest unit price change between first and last invoice occurrence (helps spot inflation/supplier price changes)
- **Supplier Concentration**: A simple metric showing % of total spend from top 3 suppliers (Pareto insight)

### Data fetching changes
- Add `product_master` fetch: `supabase.from("product_master").select("id, level1_category, level2_category, level3_category, internal_product_name")`
- Build a `pmCategoryMap: Map<string, {l1, l2, l3}>` for fast lookups from line items

### Layout
```text
┌─────────────────────────────────────────────┐
│  Header + Period Filter                     │
├──────────┬──────────┬──────────┬────────────┤
│ Total    │ Invoice  │ Avg      │ Unique     │
│ Spend    │ Count    │ Invoice  │ Suppliers  │
├──────────┴──────────┴──────────┴────────────┤
│  Monthly Spend Trend (bar chart)            │
├─────────────────────┬───────────────────────┤
│  Spend by Supplier  │  Supplier Concentr.   │
│  (horiz bar)        │  (top 3 % metric)     │
├─────────────────────┴───────────────────────┤
│  L1 Category (pie)  │  L2 Category (bar)    │
├─────────────────────┴───────────────────────┤
│  L3 Category (horizontal bar)               │
├─────────────────────────────────────────────┤
│  Expenses by Product (top 20 + show all)    │
├─────────────────────────────────────────────┤
│  Price Variance (top 10 items)              │
├─────────────────────────────────────────────┤
│  Supplier Tree View (existing, unchanged)   │
└─────────────────────────────────────────────┘
```

### Technical details
- Single file change: `ProcurementDashboardTab.tsx`
- Add `PieChart, Pie, Cell` imports from recharts (already a dependency)
- No database changes needed
- All new charts respect the existing month filter

