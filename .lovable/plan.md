
The user is asking whether the AI assistant (which I just built) can: (1) create charts, (2) analyze data, and (3) make suggestions/recommendations.

Current state: the assistant has read-only data tools (get_sales_summary, get_invoice_summary, get_top_suppliers, get_cost_of_revenue, get_venue_performance, get_pl_period). It already returns text analysis and can make recommendations from the numbers it queries — but it does NOT currently render charts.

So the honest answer is: **analysis + recommendations = already works.** **Charts = needs a small addition.** Let me plan that addition.

## Plan: Add chart rendering + explicit analyst behavior

### What already works (no changes needed)
The assistant can already pull live data and produce written analysis + recommendations like:
- *"Caliente's cost-of-revenue jumped from 28% in Sept to 36% in Oct — driven mostly by Angliss spend doubling. Consider reviewing portion sizes or renegotiating."*
- *"Top 3 suppliers are 62% of spend YTD. Concentration risk — consider a backup for Beverage World."*

This works today because Gemini reasons over the JSON tool results and is prompted to be an analyst.

### What's missing: visual charts

Add a `render_chart` tool the model can call when a chart would help. The chart spec returns to the widget which renders it inline using the existing Recharts library (already used across the dashboard).

### Changes

1. **Edge function** `supabase/functions/chat-assistant/index.ts`
   - Add new tool `render_chart` with parameters: `type` (line/bar/pie), `title`, `data` (array of `{name, value}` or `{name, [series]: value}`), `series` (optional list of series keys for multi-series).
   - The function doesn't execute the chart — it just emits the spec back as an SSE event so the model can call it after analyzing data.
   - Strengthen system prompt: *"You are a senior F&B analyst for KHAMBU. Always: (1) query real data with tools, (2) interpret what the numbers mean, (3) call out anomalies, (4) end with 1-3 actionable recommendations. Use `render_chart` whenever a trend, breakdown, or comparison would clarify your point."*

2. **Frontend widget** `src/components/assistant/AssistantWidget.tsx`
   - Detect `render_chart` tool calls in the SSE stream and render an inline chart card inside the assistant's message.
   - New tiny component `AssistantChart.tsx` — wraps Recharts (LineChart / BarChart / PieChart) using the existing terracotta/gold palette from the dashboard.
   - Charts appear inline alongside the markdown text, so a single answer can be: text → chart → recommendations.

### Example interaction after the change
> **You:** "How's Caliente trending this quarter?"
>
> **Assistant:**
> Caliente's revenue is up 12% Q-on-Q, but cost-of-revenue climbed from 29% to 34%.
>
> *[inline line chart: monthly revenue vs cost%]*
>
> **Recommendations:**
> 1. Audit Angliss invoices — spend up 40% with flat covers
> 2. Review menu mix — top 5 dishes haven't changed but margin shrank
> 3. Set a 32% cost-of-revenue ceiling alert

### Verification
1. Ask *"Show me revenue by venue this year"* → assistant returns text + bar chart of 4 venues
2. Ask *"How is cost of revenue trending?"* → text + line chart + recommendations
3. Ask a non-chart question → no chart rendered, just analysis (model decides)
4. Confirm charts use the warm terracotta palette and match dashboard styling
