
The user wants the AI Analyst to be substantially more capable — deeper data access, smarter analysis, better recommendations. Currently it has 7 tools (sales summary, invoice summary, top suppliers, cost of revenue, venue performance, P&L period, line items). It's missing major data domains: HR/payroll, inventory, menu costing, forecasts vs actuals, supplier price trends, and cross-domain analysis (e.g. labor cost % of revenue).

It also doesn't proactively reason — it just answers what's asked. To make it "intelligent", I need to: (1) give it more data tools, (2) upgrade the model to a stronger reasoner, (3) restructure the system prompt to push proactive analysis, (4) let it chain multiple tool calls per turn.

## Plan: Make AI Analyst comprehensive & intelligent

### One file: `supabase/functions/chat-assistant/index.ts`

### 1. Add 6 new tools for full data coverage

| Tool | Purpose |
|---|---|
| `get_hr_summary` | Headcount, payroll cost by venue/month, labor cost % of revenue |
| `get_inventory_status` | Current stock, par levels, items below reorder, last count variances |
| `get_menu_costing` | Menu items with theoretical food cost %, GP, flag items above target % |
| `get_forecast_vs_actual` | Forecasted vs actual revenue/covers/spend per venue per period, variance |
| `get_supplier_price_trends` | Per-supplier price changes over time — flag items with >X% increase |
| `compare_periods` | Generic period-over-period comparator (revenue, spend, labor, GP) with deltas |

Each tool aggregates server-side and returns compact JSON (≤8KB) so the model can reason without context bloat.

### 2. Upgrade model & enable multi-step reasoning

- Switch from `google/gemini-2.5-flash` → `google/gemini-2.5-pro` for stronger reasoning.
- Increase tool-call loop from 5 → 10 iterations so the model can chain queries (e.g. fetch revenue → fetch labor → fetch COGS → compute margin → recommend).
- Keep `google/gemini-2.5-flash` as automatic fallback if Pro returns 429/402/5xx.

### 3. Rewrite system prompt for proactive intelligence

New prompt rules:
- **Always go beyond the literal question.** If asked "what's revenue this month", also surface MoM trend, top/bottom venue, and one anomaly worth attention.
- **Always end with Recommendations** — minimum 2 concrete, numbered actions tied to actual numbers in the answer.
- **Cross-domain by default.** When asked about cost, also pull revenue to show %. When asked about labor, also pull covers to show $/cover.
- **Anomaly hunting.** Flag any metric >20% off its 3-month average; call it out under a `### Watch-outs` section.
- **Confidence & data scope.** State the date range and row count used. Never invent numbers.
- **Tone.** Operator-friendly, terse, financial. No filler.

Output structure becomes:
```
### Headline answer
[Table with the asked numbers]

### Context
[1-2 lines: how this compares to prior period / target]

### Watch-outs (if any)
- Anomaly 1 (with number)

### Recommendations
1. Action with $ or % impact
2. Action…
```

### 4. Light UI touch (Assistant.tsx)

Add 4 smarter starter prompts to replace the current generic ones:
- "Where am I losing margin this month?"
- "Which suppliers raised prices in the last 90 days?"
- "Compare labor cost vs revenue across venues YTD"
- "What should I focus on this week?"

### Verification

1. Ask *"Where am I losing margin this month?"* → assistant should pull revenue, COGS, labor, compute GP%, identify worst venue, recommend 2-3 actions.
2. Ask *"Which suppliers raised prices recently?"* → uses `get_supplier_price_trends`, returns sorted table + flagged items.
3. Ask *"Give me a weekly executive summary"* → chains 4-5 tool calls, returns structured digest.
4. Existing simple questions ("revenue last month") still work and now include extra context + recs.

### Out of scope

- No DB schema changes.
- No new pages or auth changes.
- Tools are read-only aggregations over existing tables.
