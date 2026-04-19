
The user is reporting that the AI assistant gives wrong unit prices when drilling into line items (e.g., for "ASAHI SUPER DRY KEG 1X20L"). The model claims certain prices and dismisses the user's correct figure of HK$ 1,150.

Let me check the actual data to understand what's wrong, then plan a fix.

**Likely causes:**
1. `product_search` is fuzzy substring on `description` only — misses items where the supplier wrote the description differently (e.g., "Asahi Super Dry 20L" vs "ASAHI SUPER DRY KEG 1X20L"). The model then gets a partial set of line items and reports averaged/aggregated prices.
2. When `group_by="product"` is used, the tool aggregates by description string — so two near-identical descriptions become two rows, and the model may quote one while missing the other.
3. The aggregation likely returns `total_spend / total_qty` as an "average unit price", but the model presents it as THE unit price — masking actual variation.
4. No way for the model to see individual invoice rows with date + invoice number for verification.

**Fix plan (single file: `supabase/functions/chat-assistant/index.ts`):**

### 1. Broaden `product_search` matching
Search across `description`, `item_code`, AND the joined product_master `internal_product_name` + `internal_sku` + `external_sku`. Tokenize the search query (split on spaces) and match if ANY token appears — so "asahi 20L" finds both "ASAHI SUPER DRY KEG 1X20L" and "Asahi Super Dry 20L".

### 2. Return BOTH aggregated and detailed views
When `group_by="product"`, also include:
- `min_unit_price`, `max_unit_price`, `avg_unit_price` (weighted by qty)
- `unit_price_variants`: list of distinct unit prices seen with their counts
- `last_invoice_date`, `last_unit_price` (most recent price)

### 3. Add `group_by="none"` raw mode that returns per-line detail
Each row: `invoice_date`, `invoice_number`, `supplier`, `description`, `qty`, `unit`, `unit_price`, `total`. Increase `limit` cap to 200 for this mode so the model can see every transaction.

### 4. Update system prompt with strict price-reporting rules
Add to the prompt:
> When reporting unit prices for a specific item:
> - ALWAYS call `get_invoice_line_items` with `group_by="none"` to see every individual line, not just aggregates.
> - Report the FULL range (min–max) and list each distinct price with its invoice date.
> - NEVER claim a price is "not in the data" without first searching with broader terms (try the brand name alone, then the SKU/item code).
> - If the user says they saw a different price, RE-QUERY with looser filters before disagreeing — the user is usually right.
> - Show prices in a table with columns: Date | Invoice # | Supplier | Description | Qty | Unit Price | Total.

### Verification
1. Ask *"What's the unit price history for Asahi Super Dry 20L keg?"* → returns table of every line with date, invoice #, and price; range shown clearly.
2. Provide a price the assistant previously dismissed → it should re-query and find it (or honestly explain which invoices it searched).
3. Existing aggregated questions ("top products by spend") still work — `group_by="product"` default unchanged.

### Out of scope
- Not changing the database or any UI.
- Not changing other tools (`get_sales_summary`, etc.).
