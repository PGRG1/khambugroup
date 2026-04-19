
User is asking if it's possible to add an AI assistant to their KHAMBU dashboard. Yes — Lovable AI is already configured (LOVABLE_API_KEY is in secrets), so this is straightforward. I should clarify what kind of assistant before planning.

Given the app context (revenue analytics, procurement, invoices, HR), an AI assistant could be:
1. A general chat helper (floating widget anywhere)
2. A data-aware analyst that can answer questions about their actual sales/invoices/procurement data
3. A page-specific helper (e.g. only on dashboards)

Option 2 is the most valuable but most complex. Need to ask before designing.

## Yes — adding an AI Assistant is fully supported

Lovable AI is already wired into the project (the `LOVABLE_API_KEY` secret is set and the receipt/invoice scanners already use it). Adding a conversational assistant is a clean addition — no new accounts, API keys, or external setup needed.

### What's possible

A floating chat widget (bottom-right bubble) available across the app, powered by `google/gemini-3-flash-preview` via a new edge function. Three flavors — pick one before I plan in detail:

| Option | What it does | Complexity |
|---|---|---|
| **A. General assistant** | Answers questions, explains features, helps with formulas/exports. No access to your data. | Low |
| **B. Data-aware analyst** (recommended) | Can query your actual sales, invoices, suppliers, P&L — e.g. *"What was Caliente's revenue last month?"*, *"Top 5 suppliers by spend YTD"*, *"Which days had Cost of Revenue > 35%?"* | Medium |
| **C. Page-aware copilot** | Sees what's on the current page (current filter, chart data) and answers contextual questions about it. | Medium |

B and C can be combined later.

### Standard pieces (apply to all options)
- New edge function `supabase/functions/chat-assistant/index.ts` with streaming SSE responses
- New floating widget `src/components/assistant/AssistantWidget.tsx` mounted in `App.tsx`
- Chat history kept in component state (no DB persistence unless you want it)
- Markdown rendering of replies, 429/402 error toasts, abort-on-close

### For Option B specifically
- The edge function exposes a small set of safe, read-only "tools" the model can call: `get_sales_summary`, `get_invoice_summary`, `get_top_suppliers`, `get_pl_period`, etc. Each tool runs a parameterized Supabase query server-side using the service role — the model never writes SQL directly.
- All queries respect the same canonical sales math (Total Revenue = Subtotal + Service Charge, etc.) already in the codebase.
- Admin-only by default; can be permissioned per user later via the existing UAC system.

### Quick questions before I build

1. Which flavor? (A / B / C / B+C)
2. Who can use it? (Admins only / All authenticated users / Permissioned via User Access Control)
3. Should chat history persist across sessions, or reset each visit?
