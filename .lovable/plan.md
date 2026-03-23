

## Problem

Supabase returns a maximum of 1,000 rows per query by default. The project has 3,358 invoice line items, so the line items tab only displays ~1,000 of them, causing the total to appear lower than the actual invoice total.

The same issue affects the Procurement Dashboard tab, which also queries `invoice_line_items` without pagination.

## Solution

Implement a paginated fetch loop that retrieves all rows in batches of 1,000 for all components that query `invoice_line_items`.

### Files to modify

**1. `src/components/procurement/ProcurementLineItemsTab.tsx`**
- Replace the single `supabase.from("invoice_line_items").select("*")` call with a loop that fetches in batches of 1,000 using `.range(offset, offset + 999)` until fewer than 1,000 rows are returned.
- Concatenate all batches before mapping.

**2. `src/components/invoices/LineItemsTab.tsx`**
- Same paginated fetch pattern for the `invoice_line_items` query.

**3. `src/components/procurement/ProcurementDashboardTab.tsx`**
- Same paginated fetch pattern for the `invoice_line_items` query used in the dashboard analytics.

### Technical detail

```typescript
// Helper to fetch all rows from a table
async function fetchAllRows(table: string, select: string, order?: { col: string; asc: boolean }) {
  const PAGE = 1000;
  let all: any[] = [];
  let offset = 0;
  while (true) {
    let q = supabase.from(table).select(select).range(offset, offset + PAGE - 1);
    if (order) q = q.order(order.col, { ascending: order.asc });
    const { data } = await q;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}
```

This will be extracted as a shared utility or inlined in each component. No database changes needed.

