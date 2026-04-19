
The user wants the AI assistant to be able to drill into invoice line items — not just invoice headers. Currently the assistant has `get_invoice_summary` which only returns counts/totals, but no tool exposes the `invoice_line_items` table.

I need to add a tool that lets the model query line items, filtered by supplier, date range, venue, and product. The `invoice_line_items` table has: description, quantity, unit, unit_price, total, item_code, pack_size, etc., joined to `invoices` for date/venue/supplier.

## Plan: Add line-item drill-down tool to AI Analyst

### One change: `supabase/functions/chat-assistant/index.ts`

Add a new tool `get_invoice_line_items` the model can call when asked about specific items, quantities, or product-level spend.

**Parameters:**
- `supplier_name` (optional, fuzzy match)
- `date_from`, `date_to` (optional)
- `venue` (optional)
- `product_search` (optional — fuzzy match on item description)
- `group_by`: `none` | `product` | `supplier` (default `product` — aggregates qty + spend per item)
- `limit` (default 50)

**Returns** (when `group_by=product`):
| description | item_code | total_qty | unit | total_spend | invoice_count |

**Implementation:**
- Fetch `invoice_line_items` (description, quantity, unit, unit_price, total, item_code, invoice_id) using existing `fetchAll` paginator
- Fetch matching `invoices` (id, invoice_date, venue, supplier_id) and `suppliers` (id, name) once
- Filter line items by joining on invoice_id → apply venue/date/supplier filters
- Apply `product_search` substring match on description
- Aggregate per `group_by` and sort by `total_spend` desc

Also update the system prompt to mention this new capability: *"For questions about specific items, quantities purchased, or product-level spend (e.g. 'how many cases of X did we buy'), use `get_invoice_line_items`."*

### Example after the change
> **You:** "What did we order from Ming Kee in April?"
>
> **Assistant:** *(calls `get_invoice_line_items` with supplier_name="Ming Kee", date_from="2026-04-01", date_to="2026-04-30", group_by="product")*
>
> | Item | Qty | Unit | Spend |
> |---|---:|---|---:|
> | Whole Chicken | 48 | each | HK$ 8,400 |
> | Chicken Wings 2kg | 22 | bag | HK$ 6,200 |
> | … | | | |
>
> **Key insights:** Whole chickens = 31% of spend; wing volume up vs March.
> **Recommendations:** 1. Negotiate volume discount on whole chicken …

### Verification
1. Ask *"What items did we buy from Ming Kee in April?"* → returns grouped line items table
2. Ask *"Top 10 products by spend YTD"* → product-level aggregation across all suppliers
3. Ask *"How many kg of beef did we order last quarter?"* → product_search filter works
4. Existing assistant questions (sales, KPIs, top suppliers) still work unchanged
