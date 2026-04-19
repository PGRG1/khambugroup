// Data-aware AI analyst for KHAMBU dashboard.
// Streams SSE responses from Lovable AI Gateway with read-only DB tools.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// ---------- helpers ----------
async function fetchAll<T = any>(
  table: string,
  cols = "*",
  filters?: (q: any) => any,
): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  const out: T[] = [];
  while (true) {
    let q = admin.from(table).select(cols).range(from, from + pageSize - 1);
    if (filters) q = filters(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function inDateRange(dateStr: string, from?: string, to?: string) {
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

// ---------- tools ----------
const tools = [
  {
    type: "function",
    function: {
      name: "get_sales_summary",
      description:
        "Aggregate sales totals (revenue, total sales, orders, guests) across venues for a date range. Total Revenue = subtotal + service_charge. Total Sales = Total Revenue - discount.",
      parameters: {
        type: "object",
        properties: {
          venue: { type: "string", enum: ["All", "Assembly", "Caliente", "Hanabi", "Events"] },
          date_from: { type: "string", description: "YYYY-MM-DD inclusive" },
          date_to: { type: "string", description: "YYYY-MM-DD inclusive" },
          group_by: { type: "string", enum: ["none", "venue", "month", "day"], default: "none" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_invoice_summary",
      description: "Counts and totals of invoices, optionally filtered by venue, supplier, status, date range.",
      parameters: {
        type: "object",
        properties: {
          venue: { type: "string" },
          supplier_name: { type: "string" },
          status: { type: "string", description: "pending|verified|approved|paid|outstanding|under_review|cancelled" },
          date_from: { type: "string" },
          date_to: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_suppliers",
      description: "Top suppliers by total invoice spend in a date range.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string" },
          date_to: { type: "string" },
          limit: { type: "number", default: 10 },
          venue: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cost_of_revenue",
      description: "Compute cost-of-revenue % = (invoice spend / total revenue) * 100 for a date range, optionally per venue.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string" },
          date_to: { type: "string" },
          venue: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_venue_performance",
      description: "Per-venue revenue, total sales, orders, guests, avg spend per guest.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string" },
          date_to: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pl_period",
      description: "Manual P&L line items by year (and optionally month).",
      parameters: {
        type: "object",
        properties: {
          year: { type: "number" },
          month: { type: "number", description: "1-12, optional" },
        },
        required: ["year"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "render_chart",
      description:
        "Render a chart inline in the chat to visualize data you've already analyzed. Call this AFTER fetching data with other tools, whenever a trend, breakdown, or comparison would clarify your point. The chart appears inline in your reply.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["line", "bar", "pie"], description: "Chart type" },
          title: { type: "string", description: "Short chart title" },
          x_key: { type: "string", default: "name", description: "Key for x-axis / category labels (default 'name')" },
          series: {
            type: "array",
            items: { type: "string" },
            description: "Numeric data keys to plot. For single-series use ['value']. For multi-series e.g. ['revenue','spend'].",
          },
          data: {
            type: "array",
            description: "Array of objects. Each object must have the x_key (e.g. 'name') plus all series keys. Example: [{name:'Jan',revenue:1000,spend:300}]",
            items: { type: "object" },
          },
        },
        required: ["type", "title", "series", "data"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_database_overview",
      description: "Quick counts: invoices, line items, sales records, suppliers, products, employees. Use when user asks 'how much data' or 'what's in the system'.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ---------- tool handlers ----------
async function runTool(name: string, args: any): Promise<any> {
  switch (name) {
    case "get_sales_summary": {
      const sales = await fetchAll<any>("sales_records", "date,venue,subtotal,service_charge,discount,orders,guests");
      const filtered = sales.filter(
        (s) =>
          (!args.venue || args.venue === "All" || s.venue === args.venue) &&
          inDateRange(s.date, args.date_from, args.date_to),
      );
      const calc = (rows: any[]) => {
        const revenue = rows.reduce((a, r) => a + Number(r.subtotal || 0) + Number(r.service_charge || 0), 0);
        const discount = rows.reduce((a, r) => a + Number(r.discount || 0), 0);
        return {
          revenue: +revenue.toFixed(2),
          total_sales: +(revenue - discount).toFixed(2),
          orders: rows.reduce((a, r) => a + Number(r.orders || 0), 0),
          guests: rows.reduce((a, r) => a + Number(r.guests || 0), 0),
          records: rows.length,
        };
      };
      const groupBy = args.group_by || "none";
      if (groupBy === "none") return { range: { from: args.date_from, to: args.date_to }, ...calc(filtered) };
      const groups: Record<string, any[]> = {};
      for (const r of filtered) {
        const key =
          groupBy === "venue" ? r.venue : groupBy === "month" ? r.date.slice(0, 7) : r.date;
        (groups[key] ||= []).push(r);
      }
      return Object.entries(groups)
        .map(([k, rows]) => ({ key: k, ...calc(rows) }))
        .sort((a, b) => (a.key < b.key ? -1 : 1));
    }

    case "get_invoice_summary": {
      const [invoices, suppliers] = await Promise.all([
        fetchAll<any>("invoices", "id,invoice_date,venue,supplier_id,total_amount,status,payment_status"),
        fetchAll<any>("suppliers", "id,name"),
      ]);
      const supMap = new Map(suppliers.map((s) => [s.id, s.name]));
      let rows = invoices.filter(
        (i) =>
          (!args.venue || i.venue === args.venue) &&
          (!args.status || i.status === args.status) &&
          inDateRange(i.invoice_date, args.date_from, args.date_to),
      );
      if (args.supplier_name) {
        const needle = args.supplier_name.toLowerCase();
        rows = rows.filter((i) => (supMap.get(i.supplier_id) || "").toLowerCase().includes(needle));
      }
      const total = rows.reduce((a, r) => a + Number(r.total_amount || 0), 0);
      const byStatus: Record<string, number> = {};
      for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      return {
        count: rows.length,
        total_spend: +total.toFixed(2),
        by_status: byStatus,
      };
    }

    case "get_top_suppliers": {
      const [invoices, suppliers] = await Promise.all([
        fetchAll<any>("invoices", "supplier_id,invoice_date,venue,total_amount"),
        fetchAll<any>("suppliers", "id,name"),
      ]);
      const supMap = new Map(suppliers.map((s) => [s.id, s.name]));
      const filtered = invoices.filter(
        (i) =>
          (!args.venue || i.venue === args.venue) && inDateRange(i.invoice_date, args.date_from, args.date_to),
      );
      const totals = new Map<string, { name: string; total: number; count: number }>();
      for (const i of filtered) {
        const name = supMap.get(i.supplier_id) || "Unknown";
        const cur = totals.get(name) || { name, total: 0, count: 0 };
        cur.total += Number(i.total_amount || 0);
        cur.count += 1;
        totals.set(name, cur);
      }
      return Array.from(totals.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, args.limit || 10)
        .map((s) => ({ supplier: s.name, total_spend: +s.total.toFixed(2), invoice_count: s.count }));
    }

    case "get_cost_of_revenue": {
      const [sales, invoices] = await Promise.all([
        fetchAll<any>("sales_records", "date,venue,subtotal,service_charge"),
        fetchAll<any>("invoices", "invoice_date,venue,total_amount"),
      ]);
      const filterSales = sales.filter(
        (s) => (!args.venue || s.venue === args.venue) && inDateRange(s.date, args.date_from, args.date_to),
      );
      const filterInv = invoices.filter(
        (i) =>
          (!args.venue || i.venue === args.venue) && inDateRange(i.invoice_date, args.date_from, args.date_to),
      );
      const revenue = filterSales.reduce((a, r) => a + Number(r.subtotal || 0) + Number(r.service_charge || 0), 0);
      const spend = filterInv.reduce((a, r) => a + Number(r.total_amount || 0), 0);
      return {
        revenue: +revenue.toFixed(2),
        invoice_spend: +spend.toFixed(2),
        cost_of_revenue_pct: revenue > 0 ? +((spend / revenue) * 100).toFixed(2) : null,
      };
    }

    case "get_venue_performance": {
      const sales = await fetchAll<any>(
        "sales_records",
        "date,venue,subtotal,service_charge,discount,orders,guests",
      );
      const filtered = sales.filter((s) => inDateRange(s.date, args.date_from, args.date_to));
      const venues: Record<string, any> = {};
      for (const r of filtered) {
        const v = (venues[r.venue] ||= { venue: r.venue, revenue: 0, total_sales: 0, orders: 0, guests: 0 });
        const rev = Number(r.subtotal || 0) + Number(r.service_charge || 0);
        v.revenue += rev;
        v.total_sales += rev - Number(r.discount || 0);
        v.orders += Number(r.orders || 0);
        v.guests += Number(r.guests || 0);
      }
      return Object.values(venues).map((v: any) => ({
        ...v,
        revenue: +v.revenue.toFixed(2),
        total_sales: +v.total_sales.toFixed(2),
        avg_spend_per_guest: v.guests > 0 ? +(v.revenue / v.guests).toFixed(2) : null,
      }));
    }

    case "get_pl_period": {
      const rows = await fetchAll<any>("pl_manual_lines", "*", (q) => {
        let qq = q.eq("year", args.year);
        if (args.month) qq = qq.eq("month", args.month);
        return qq;
      });
      return rows;
    }

    case "get_database_overview": {
      const counts = async (t: string) => {
        const { count } = await admin.from(t).select("*", { count: "exact", head: true });
        return count || 0;
      };
      const [inv, lines, sales, sup, prod, emp] = await Promise.all([
        counts("invoices"),
        counts("invoice_line_items"),
        counts("sales_records"),
        counts("suppliers"),
        counts("product_master"),
        counts("hr_employees"),
      ]);
      return { invoices: inv, invoice_line_items: lines, sales_records: sales, suppliers: sup, products: prod, employees: emp };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------- system prompt ----------
const SYSTEM_PROMPT = `You are KHAMBU's data analyst assistant. KHAMBU operates F&B venues: Assembly, Caliente, Hanabi, and Events.

You have read-only access to the live database via tools. When a user asks about sales, revenue, suppliers, invoices, P&L, or venue performance, ALWAYS call the appropriate tool — never invent numbers.

Key formulas (already enforced server-side):
- Total Revenue = subtotal + service_charge
- Total Sales = Total Revenue - discount
- Cost of Revenue % = invoice spend / total revenue * 100
- Avg Spend per Guest = revenue / guests

Today's date: ${new Date().toISOString().slice(0, 10)}.

When dates are vague ("last month", "YTD", "this quarter"), resolve them yourself before calling tools. Format currency as HK$ with thousand separators. Be concise and use markdown tables for comparisons.`;

// ---------- main handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages must be an array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const conversation: any[] = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

    // Tool-calling loop (non-stream until tools done, then stream final reply)
    for (let iter = 0; iter < 5; iter++) {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: conversation,
          tools,
          tool_choice: "auto",
        }),
      });

      if (!resp.ok) {
        const status = resp.status;
        const text = await resp.text();
        console.error("Gateway error", status, text);
        const msg =
          status === 429
            ? "Rate limit hit — please wait a moment and try again."
            : status === 402
              ? "AI credits exhausted. Please add funds in Settings → Workspace → Usage."
              : "AI gateway error.";
        return new Response(JSON.stringify({ error: msg }), {
          status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await resp.json();
      const choice = data.choices?.[0]?.message;
      if (!choice) break;

      const toolCalls = choice.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        // No more tools — stream this final reply back as SSE for consistency
        const content = choice.content || "";
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            // Chunk by ~12 chars for nice streaming feel
            const chunkSize = 12;
            let i = 0;
            const tick = () => {
              if (i >= content.length) {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                return;
              }
              const piece = content.slice(i, i + chunkSize);
              i += chunkSize;
              const payload = JSON.stringify({ choices: [{ delta: { content: piece } }] });
              controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
              setTimeout(tick, 12);
            };
            tick();
          },
        });
        return new Response(stream, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      // Run tools
      conversation.push(choice);
      for (const tc of toolCalls) {
        const args = (() => {
          try {
            return JSON.parse(tc.function.arguments || "{}");
          } catch {
            return {};
          }
        })();
        let result: any;
        try {
          result = await runTool(tc.function.name, args);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : String(e) };
        }
        conversation.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    }

    return new Response(JSON.stringify({ error: "Tool loop exhausted" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("chat-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
