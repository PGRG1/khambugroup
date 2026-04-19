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
      name: "get_invoice_line_items",
      description:
        "Drill into invoice line items. Use group_by='none' to see EVERY individual line (with date, invoice #, supplier, qty, unit_price, total) — REQUIRED when reporting unit price history or verifying a specific price. Use group_by='product' for aggregated spend per item (returns min/max/avg/last unit prices and distinct price variants). product_search is tokenized: any token matching description, item_code, or product master name/SKU is included.",
      parameters: {
        type: "object",
        properties: {
          supplier_name: { type: "string", description: "Fuzzy match on supplier name" },
          date_from: { type: "string", description: "YYYY-MM-DD inclusive" },
          date_to: { type: "string", description: "YYYY-MM-DD inclusive" },
          venue: { type: "string" },
          product_search: { type: "string", description: "Tokenized search across description, item_code, product master name & SKUs. Try short brand/SKU terms first (e.g. 'asahi', 'ASA20')." },
          group_by: { type: "string", enum: ["none", "product", "supplier"], default: "product" },
          limit: { type: "number", default: 50, description: "Max rows. Up to 200 for group_by='none'." },
        },
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
  {
    type: "function",
    function: {
      name: "get_hr_summary",
      description: "Headcount and payroll cost summary. Returns active headcount by venue, total payroll (forecast + actual) by month, and labor cost % of revenue when sales data is available.",
      parameters: {
        type: "object",
        properties: {
          year: { type: "number" },
          month: { type: "number", description: "1-12, optional" },
          venue: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_inventory_status",
      description: "Current inventory: items with current qty, par level, items below reorder, and most recent inventory count variances (usage vs purchases).",
      parameters: {
        type: "object",
        properties: {
          venue: { type: "string" },
          below_par_only: { type: "boolean", default: false },
          limit: { type: "number", default: 50 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_menu_costing",
      description: "Menu items with theoretical food cost %, gross profit, and selling price. Flags items above target cost % (default 35%).",
      parameters: {
        type: "object",
        properties: {
          target_cost_pct: { type: "number", default: 35 },
          flagged_only: { type: "boolean", default: false },
          limit: { type: "number", default: 50 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_forecast_vs_actual",
      description: "Compares forecasted vs actual revenue, customers, and avg spend per venue per date. Returns variance and variance %.",
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
      name: "get_supplier_price_trends",
      description: "Detects items where unit price changed materially across invoices. Returns items sorted by % price change with first/last price and dates. Use to spot supplier price hikes.",
      parameters: {
        type: "object",
        properties: {
          supplier_name: { type: "string" },
          date_from: { type: "string" },
          date_to: { type: "string" },
          min_change_pct: { type: "number", default: 5, description: "Minimum % change to include" },
          limit: { type: "number", default: 30 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_periods",
      description: "Period-over-period comparator. Computes revenue, total sales, invoice spend, cost-of-revenue %, guests, avg spend per guest for two date ranges and the deltas.",
      parameters: {
        type: "object",
        properties: {
          period_a_from: { type: "string" },
          period_a_to: { type: "string" },
          period_b_from: { type: "string" },
          period_b_to: { type: "string" },
          venue: { type: "string" },
        },
        required: ["period_a_from", "period_a_to", "period_b_from", "period_b_to"],
      },
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

    case "get_invoice_line_items": {
      const [lineItems, invoices, suppliers, products] = await Promise.all([
        fetchAll<any>("invoice_line_items", "invoice_id,description,quantity,unit,unit_price,total,item_code,pack_size,product_master_id"),
        fetchAll<any>("invoices", "id,invoice_date,invoice_number,venue,supplier_id"),
        fetchAll<any>("suppliers", "id,name"),
        fetchAll<any>("product_master", "id,internal_product_name,internal_sku,external_sku"),
      ]);
      const supMap = new Map(suppliers.map((s) => [s.id, s.name]));
      const invMap = new Map(invoices.map((i) => [i.id, i]));
      const pmMap = new Map(products.map((p) => [p.id, p]));

      const supplierNeedle = args.supplier_name?.toLowerCase();
      const rawSearch = (args.product_search || "").toLowerCase().trim();
      // Tokenize: split on whitespace, drop tokens shorter than 2 chars
      const tokens = rawSearch ? rawSearch.split(/\s+/).filter((t: string) => t.length >= 2) : [];

      const filtered = lineItems.filter((li) => {
        const inv = invMap.get(li.invoice_id);
        if (!inv) return false;
        if (args.venue && inv.venue !== args.venue) return false;
        if (!inDateRange(inv.invoice_date, args.date_from, args.date_to)) return false;
        if (supplierNeedle) {
          const supName = (supMap.get(inv.supplier_id) || "").toLowerCase();
          if (!supName.includes(supplierNeedle)) return false;
        }
        if (tokens.length) {
          const pm = li.product_master_id ? pmMap.get(li.product_master_id) : null;
          const haystack = [
            li.description || "",
            li.item_code || "",
            pm?.internal_product_name || "",
            pm?.internal_sku || "",
            pm?.external_sku || "",
          ].join(" ").toLowerCase();
          // ANY token match (broader recall)
          if (!tokens.some((t: string) => haystack.includes(t))) return false;
        }
        return true;
      });

      const groupBy = args.group_by || "product";
      const limit = Math.min(args.limit || 50, groupBy === "none" ? 200 : 100);

      if (groupBy === "none") {
        // Sort newest first so the model sees most recent prices
        const sorted = [...filtered].sort((a, b) => {
          const da = invMap.get(a.invoice_id)?.invoice_date || "";
          const db = invMap.get(b.invoice_id)?.invoice_date || "";
          return db.localeCompare(da);
        });
        return {
          mode: "detail",
          row_count: sorted.length,
          returned: Math.min(sorted.length, limit),
          rows: sorted.slice(0, limit).map((li) => {
            const inv = invMap.get(li.invoice_id);
            return {
              date: inv?.invoice_date,
              invoice_number: inv?.invoice_number,
              venue: inv?.venue,
              supplier: supMap.get(inv?.supplier_id) || "Unknown",
              description: li.description,
              item_code: li.item_code || "",
              quantity: Number(li.quantity || 0),
              unit: li.unit || "",
              unit_price: +Number(li.unit_price || 0).toFixed(4),
              total: +Number(li.total || 0).toFixed(2),
            };
          }),
        };
      }

      if (groupBy === "supplier") {
        const groups = new Map<string, { supplier: string; total_spend: number; line_count: number; invoice_ids: Set<string> }>();
        for (const li of filtered) {
          const inv = invMap.get(li.invoice_id);
          const name = supMap.get(inv?.supplier_id) || "Unknown";
          const cur = groups.get(name) || { supplier: name, total_spend: 0, line_count: 0, invoice_ids: new Set() };
          cur.total_spend += Number(li.total || 0);
          cur.line_count += 1;
          cur.invoice_ids.add(li.invoice_id);
          groups.set(name, cur);
        }
        return Array.from(groups.values())
          .sort((a, b) => b.total_spend - a.total_spend)
          .slice(0, limit)
          .map((g) => ({
            supplier: g.supplier,
            total_spend: +g.total_spend.toFixed(2),
            line_count: g.line_count,
            invoice_count: g.invoice_ids.size,
          }));
      }

      // group by product (description + item_code) with price stats
      const groups = new Map<string, any>();
      for (const li of filtered) {
        const key = `${(li.item_code || "").trim()}||${(li.description || "").trim().toLowerCase()}`;
        const cur = groups.get(key) || {
          description: li.description,
          item_code: li.item_code || "",
          unit: li.unit || "",
          total_qty: 0,
          total_spend: 0,
          invoice_ids: new Set<string>(),
          prices: [] as { price: number; date: string; qty: number }[],
        };
        const inv = invMap.get(li.invoice_id);
        const qty = Number(li.quantity || 0);
        const up = Number(li.unit_price || 0);
        cur.total_qty += qty;
        cur.total_spend += Number(li.total || 0);
        cur.invoice_ids.add(li.invoice_id);
        cur.prices.push({ price: up, date: inv?.invoice_date || "", qty });
        groups.set(key, cur);
      }
      return Array.from(groups.values())
        .sort((a, b) => b.total_spend - a.total_spend)
        .slice(0, limit)
        .map((g) => {
          const prices = g.prices as { price: number; date: string; qty: number }[];
          const sortedByDate = [...prices].sort((a, b) => b.date.localeCompare(a.date));
          const variantMap = new Map<number, number>();
          for (const p of prices) variantMap.set(p.price, (variantMap.get(p.price) || 0) + 1);
          const variants = Array.from(variantMap.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([price, count]) => ({ price: +price.toFixed(4), count }));
          const totalQty = g.total_qty || 0;
          const weightedAvg = totalQty > 0 ? g.total_spend / totalQty : 0;
          return {
            description: g.description,
            item_code: g.item_code,
            total_qty: +g.total_qty.toFixed(2),
            unit: g.unit,
            total_spend: +g.total_spend.toFixed(2),
            invoice_count: g.invoice_ids.size,
            min_unit_price: +Math.min(...prices.map((p) => p.price)).toFixed(4),
            max_unit_price: +Math.max(...prices.map((p) => p.price)).toFixed(4),
            avg_unit_price: +weightedAvg.toFixed(4),
            last_invoice_date: sortedByDate[0]?.date || null,
            last_unit_price: sortedByDate[0] ? +sortedByDate[0].price.toFixed(4) : null,
            unit_price_variants: variants,
          };
        });
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

    case "get_hr_summary": {
      const [employees, payroll, sales] = await Promise.all([
        fetchAll<any>("hr_employees", "id,first_name,last_name,venue,status,employment_type"),
        fetchAll<any>("hr_payroll", "employee_id,year,month,forecast_total,actual_total,gross_salary,net_salary"),
        fetchAll<any>("sales_records", "date,venue,subtotal,service_charge"),
      ]);
      const empMap = new Map(employees.map((e) => [e.id, e]));
      const active = employees.filter((e) => e.status === "active");
      const byVenue: Record<string, number> = {};
      for (const e of active) {
        if (args.venue && e.venue !== args.venue) continue;
        byVenue[e.venue || "Unassigned"] = (byVenue[e.venue || "Unassigned"] || 0) + 1;
      }
      const filterPay = payroll.filter((p) => {
        if (args.year && p.year !== args.year) return false;
        if (args.month && p.month !== args.month) return false;
        if (args.venue) {
          const e = empMap.get(p.employee_id);
          if (!e || e.venue !== args.venue) return false;
        }
        return true;
      });
      const totalForecast = filterPay.reduce((a, p) => a + Number(p.forecast_total || 0), 0);
      const totalActual = filterPay.reduce((a, p) => a + Number(p.actual_total || 0), 0);

      let laborCostPct: number | null = null;
      let revenue = 0;
      if (args.year && args.month) {
        const ym = `${args.year}-${String(args.month).padStart(2, "0")}`;
        const filtSales = sales.filter(
          (s) => s.date.startsWith(ym) && (!args.venue || s.venue === args.venue),
        );
        revenue = filtSales.reduce((a, r) => a + Number(r.subtotal || 0) + Number(r.service_charge || 0), 0);
        if (revenue > 0) laborCostPct = +(((totalActual || totalForecast) / revenue) * 100).toFixed(2);
      }
      return {
        active_headcount: active.length,
        headcount_by_venue: byVenue,
        payroll_forecast_total: +totalForecast.toFixed(2),
        payroll_actual_total: +totalActual.toFixed(2),
        revenue: revenue ? +revenue.toFixed(2) : null,
        labor_cost_pct: laborCostPct,
        period: args.year ? { year: args.year, month: args.month || null } : null,
      };
    }

    case "get_inventory_status": {
      const [items, counts, periods] = await Promise.all([
        fetchAll<any>("inventory_items", "id,name,unit_of_measure,par_level,current_qty,is_active,unit_size"),
        fetchAll<any>("inventory_counts", "item_id,period_id,venue,beginning_qty,ending_qty,purchases_qty,usage_qty,total_usage_cost"),
        fetchAll<any>("inventory_periods", "id,venue,period_label,period_start,period_end,status"),
      ]);
      const latestPeriodByVenue = new Map<string, any>();
      for (const p of periods) {
        const cur = latestPeriodByVenue.get(p.venue);
        if (!cur || p.period_end > cur.period_end) latestPeriodByVenue.set(p.venue, p);
      }
      const active = items.filter((i) => i.is_active);
      let rows = active.map((i) => {
        const par = Number(i.par_level || 0);
        const cur = Number(i.current_qty || 0);
        const belowPar = par > 0 && cur < par;
        return {
          name: i.name,
          unit: i.unit_of_measure,
          unit_size: i.unit_size,
          current_qty: cur,
          par_level: par || null,
          below_par: belowPar,
          shortfall: belowPar ? +(par - cur).toFixed(2) : 0,
        };
      });
      if (args.below_par_only) rows = rows.filter((r) => r.below_par);
      rows.sort((a, b) => (b.shortfall || 0) - (a.shortfall || 0));

      const varianceByVenue: any[] = [];
      for (const [venue, p] of latestPeriodByVenue) {
        if (args.venue && venue !== args.venue) continue;
        const periodCounts = counts.filter((c) => c.period_id === p.id);
        const totalUsage = periodCounts.reduce((a, c) => a + Number(c.usage_qty || 0), 0);
        const totalUsageCost = periodCounts.reduce((a, c) => a + Number(c.total_usage_cost || 0), 0);
        varianceByVenue.push({
          venue,
          period: p.period_label,
          period_end: p.period_end,
          item_count: periodCounts.length,
          total_usage_qty: +totalUsage.toFixed(2),
          total_usage_cost: +totalUsageCost.toFixed(2),
        });
      }
      return {
        total_active_items: active.length,
        items_below_par: active.filter((i) => Number(i.par_level || 0) > 0 && Number(i.current_qty || 0) < Number(i.par_level || 0)).length,
        items: rows.slice(0, args.limit || 50),
        latest_period_usage: varianceByVenue,
      };
    }

    case "get_menu_costing": {
      const target = args.target_cost_pct ?? 35;
      const [items, pricing] = await Promise.all([
        fetchAll<any>("menu_items", "id,name,category,status,theoretical_cost"),
        fetchAll<any>("menu_item_pricing", "menu_item_id,price_type,selling_price,food_cost_pct,gross_profit"),
      ]);
      const priceMap = new Map<string, any[]>();
      for (const p of pricing) {
        if (!priceMap.has(p.menu_item_id)) priceMap.set(p.menu_item_id, []);
        priceMap.get(p.menu_item_id)!.push(p);
      }
      const rows = items
        .filter((i) => i.status === "Active")
        .map((i) => {
          const prices = priceMap.get(i.id) || [];
          const def = prices[0] || {};
          const cost = Number(i.theoretical_cost || 0);
          const sell = Number(def.selling_price || 0);
          const fcPct = sell > 0 ? +((cost / sell) * 100).toFixed(2) : null;
          const gp = sell - cost;
          return {
            name: i.name,
            category: i.category,
            theoretical_cost: +cost.toFixed(2),
            selling_price: +sell.toFixed(2),
            food_cost_pct: fcPct,
            gross_profit: +gp.toFixed(2),
            flagged: fcPct !== null && fcPct > target,
          };
        });
      const filtered = args.flagged_only ? rows.filter((r) => r.flagged) : rows;
      filtered.sort((a, b) => (b.food_cost_pct || 0) - (a.food_cost_pct || 0));
      return {
        target_cost_pct: target,
        flagged_count: rows.filter((r) => r.flagged).length,
        items: filtered.slice(0, args.limit || 50),
      };
    }

    case "get_forecast_vs_actual": {
      const [forecasts, sales] = await Promise.all([
        fetchAll<any>("forecasts", "date,venue,forecasted_customers,forecasted_avg_spend,forecasted_total_sales,status"),
        fetchAll<any>("sales_records", "date,venue,subtotal,service_charge,discount,guests"),
      ]);
      const fc = forecasts.filter(
        (f) =>
          (!args.venue || f.venue === args.venue) &&
          inDateRange(f.date, args.date_from, args.date_to),
      );
      const salesByKey = new Map<string, { revenue: number; guests: number }>();
      for (const s of sales) {
        if (args.venue && s.venue !== args.venue) continue;
        if (!inDateRange(s.date, args.date_from, args.date_to)) continue;
        const key = `${s.date}|${s.venue}`;
        const cur = salesByKey.get(key) || { revenue: 0, guests: 0 };
        cur.revenue += Number(s.subtotal || 0) + Number(s.service_charge || 0) - Number(s.discount || 0);
        cur.guests += Number(s.guests || 0);
        salesByKey.set(key, cur);
      }
      const rows = fc.map((f) => {
        const a = salesByKey.get(`${f.date}|${f.venue}`);
        const actualRev = a?.revenue ?? null;
        const actualGuests = a?.guests ?? null;
        const actualAvg = actualGuests && actualGuests > 0 ? +(actualRev! / actualGuests).toFixed(2) : null;
        const revVar = actualRev !== null ? +(actualRev - Number(f.forecasted_total_sales || 0)).toFixed(2) : null;
        const revVarPct =
          actualRev !== null && Number(f.forecasted_total_sales) > 0
            ? +((revVar! / Number(f.forecasted_total_sales)) * 100).toFixed(2)
            : null;
        return {
          date: f.date,
          venue: f.venue,
          forecast_revenue: +Number(f.forecasted_total_sales || 0).toFixed(2),
          actual_revenue: actualRev,
          revenue_variance: revVar,
          revenue_variance_pct: revVarPct,
          forecast_customers: Number(f.forecasted_customers || 0),
          actual_customers: actualGuests,
          forecast_avg_spend: +Number(f.forecasted_avg_spend || 0).toFixed(2),
          actual_avg_spend: actualAvg,
        };
      });
      rows.sort((a, b) => (a.date < b.date ? -1 : 1));
      const sumF = rows.reduce((a, r) => a + r.forecast_revenue, 0);
      const sumA = rows.reduce((a, r) => a + (r.actual_revenue || 0), 0);
      return {
        row_count: rows.length,
        summary: {
          total_forecast: +sumF.toFixed(2),
          total_actual: +sumA.toFixed(2),
          variance: +(sumA - sumF).toFixed(2),
          variance_pct: sumF > 0 ? +(((sumA - sumF) / sumF) * 100).toFixed(2) : null,
        },
        rows: rows.slice(0, 100),
      };
    }

    case "get_supplier_price_trends": {
      const minPct = args.min_change_pct ?? 5;
      const [lineItems, invoices, suppliers] = await Promise.all([
        fetchAll<any>("invoice_line_items", "invoice_id,description,item_code,quantity,unit_price"),
        fetchAll<any>("invoices", "id,invoice_date,supplier_id"),
        fetchAll<any>("suppliers", "id,name"),
      ]);
      const supMap = new Map(suppliers.map((s) => [s.id, s.name]));
      const invMap = new Map(invoices.map((i) => [i.id, i]));
      const supplierNeedle = args.supplier_name?.toLowerCase();

      const filtered = lineItems.filter((li) => {
        const inv = invMap.get(li.invoice_id);
        if (!inv) return false;
        if (!inDateRange(inv.invoice_date, args.date_from, args.date_to)) return false;
        if (supplierNeedle) {
          const sn = (supMap.get(inv.supplier_id) || "").toLowerCase();
          if (!sn.includes(supplierNeedle)) return false;
        }
        return Number(li.unit_price || 0) > 0;
      });
      const groups = new Map<string, any[]>();
      for (const li of filtered) {
        const inv = invMap.get(li.invoice_id);
        const sup = supMap.get(inv?.supplier_id) || "Unknown";
        const key = `${sup}||${(li.item_code || "").trim()}||${(li.description || "").trim().toLowerCase()}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push({
          date: inv?.invoice_date,
          price: Number(li.unit_price),
          supplier: sup,
          description: li.description,
          item_code: li.item_code || "",
        });
      }
      const trends: any[] = [];
      for (const arr of groups.values()) {
        if (arr.length < 2) continue;
        arr.sort((a, b) => a.date.localeCompare(b.date));
        const first = arr[0];
        const last = arr[arr.length - 1];
        if (first.price === 0) continue;
        const changePct = +(((last.price - first.price) / first.price) * 100).toFixed(2);
        if (Math.abs(changePct) < minPct) continue;
        trends.push({
          supplier: first.supplier,
          description: first.description,
          item_code: first.item_code,
          first_date: first.date,
          first_price: +first.price.toFixed(4),
          last_date: last.date,
          last_price: +last.price.toFixed(4),
          change_pct: changePct,
          observation_count: arr.length,
        });
      }
      trends.sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));
      return {
        threshold_pct: minPct,
        items_changed: trends.length,
        items: trends.slice(0, args.limit || 30),
      };
    }

    case "compare_periods": {
      const [sales, invoices] = await Promise.all([
        fetchAll<any>("sales_records", "date,venue,subtotal,service_charge,discount,guests,orders"),
        fetchAll<any>("invoices", "invoice_date,venue,total_amount"),
      ]);
      const calc = (from: string, to: string) => {
        const fs = sales.filter(
          (s) => (!args.venue || s.venue === args.venue) && inDateRange(s.date, from, to),
        );
        const fi = invoices.filter(
          (i) => (!args.venue || i.venue === args.venue) && inDateRange(i.invoice_date, from, to),
        );
        const revenue = fs.reduce((a, r) => a + Number(r.subtotal || 0) + Number(r.service_charge || 0), 0);
        const discount = fs.reduce((a, r) => a + Number(r.discount || 0), 0);
        const guests = fs.reduce((a, r) => a + Number(r.guests || 0), 0);
        const orders = fs.reduce((a, r) => a + Number(r.orders || 0), 0);
        const spend = fi.reduce((a, r) => a + Number(r.total_amount || 0), 0);
        return {
          revenue: +revenue.toFixed(2),
          total_sales: +(revenue - discount).toFixed(2),
          invoice_spend: +spend.toFixed(2),
          cost_of_revenue_pct: revenue > 0 ? +((spend / revenue) * 100).toFixed(2) : null,
          guests,
          orders,
          avg_spend_per_guest: guests > 0 ? +(revenue / guests).toFixed(2) : null,
        };
      };
      const a = calc(args.period_a_from, args.period_a_to);
      const b = calc(args.period_b_from, args.period_b_to);
      const delta = (k: keyof typeof a) => {
        const av = a[k] as number | null;
        const bv = b[k] as number | null;
        if (av === null || bv === null) return null;
        return {
          abs: +(bv - av).toFixed(2),
          pct: av !== 0 ? +(((bv - av) / Math.abs(av)) * 100).toFixed(2) : null,
        };
      };
      return {
        period_a: { from: args.period_a_from, to: args.period_a_to, ...a },
        period_b: { from: args.period_b_from, to: args.period_b_to, ...b },
        deltas: {
          revenue: delta("revenue"),
          total_sales: delta("total_sales"),
          invoice_spend: delta("invoice_spend"),
          cost_of_revenue_pct: delta("cost_of_revenue_pct"),
          guests: delta("guests"),
          avg_spend_per_guest: delta("avg_spend_per_guest"),
        },
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------- system prompt ----------
const SYSTEM_PROMPT = `You are KHAMBU's senior F&B data analyst — operator-friendly, terse, financially sharp. KHAMBU operates four venues: Assembly, Caliente, Hanabi, and Events.

You have read-only access to the live database via tools. ALWAYS query real data — never invent numbers. Today's date: ${new Date().toISOString().slice(0, 10)}.

## How you think
1. **Go beyond the literal question.** If asked "revenue this month", also pull MoM trend, top/bottom venue, and one notable anomaly. If asked about cost, pull revenue too to show %. If asked about labor, pull guests/covers to show $/cover.
2. **Chain tool calls.** A single question often needs 2–5 tools. Pull revenue + invoice spend + payroll → compute margin. Use \`compare_periods\` for trend, \`get_supplier_price_trends\` to spot price hikes, \`get_forecast_vs_actual\` to flag misses.
3. **Anomaly hunt.** Flag any metric that looks materially off (>20% variance vs prior period, >5% supplier price hike, items >35% food cost). Surface under \`### Watch-outs\`.
4. **Always recommend.** Every reply ends with 2–3 numbered, concrete actions tied to actual numbers from your answer (e.g. "Renegotiate Ming Kee chicken — 12% price hike on 8 invoices, ~HK$ 3,200/mo exposure").

## Tools at a glance
- Sales & revenue: \`get_sales_summary\`, \`get_venue_performance\`, \`compare_periods\`
- Cost & margin: \`get_cost_of_revenue\`, \`get_top_suppliers\`, \`get_invoice_summary\`, \`get_invoice_line_items\`, \`get_supplier_price_trends\`
- Forecasting: \`get_forecast_vs_actual\`
- People cost: \`get_hr_summary\` (returns labor cost % when year+month given)
- Operations: \`get_inventory_status\`, \`get_menu_costing\`, \`get_pl_period\`
- Visualization: \`render_chart\` (line for trends, bar for comparisons, pie only for share-of-total ≤6 slices)
- Meta: \`get_database_overview\`

## Key formulas (server-enforced)
- Total Revenue = subtotal + service_charge
- Total Sales = Total Revenue − discount
- Cost of Revenue % = invoice spend / total revenue × 100
- Avg Spend per Guest = revenue / guests
- Labor Cost % = payroll / revenue × 100

## Unit price rules (strict — user has caught wrong prices before)
- For a SPECIFIC item's price, ALWAYS call \`get_invoice_line_items\` with \`group_by="none"\` first. Show every line: Date | Invoice # | Supplier | Description | Qty | Unit Price | Total.
- Quote the FULL min–max range and list distinct \`unit_price_variants\`. Never quote only an average.
- If user disputes a price, RE-QUERY with looser filters (drop supplier, try just brand/SKU) before disagreeing. The user is usually right.
- Never claim a price is "not in the data" without first broadening the search.

## Output structure (every answer)
\`\`\`
### Headline
[one sentence with the key number(s)]

[GitHub-flavored markdown table — required for any 2+ row data]

### Context
[1–2 lines: comparison vs prior period, target, or peer venue]

### Watch-outs
- [anomaly with the actual number — only if material]

### Recommendations
1. [Action with HK$ or % impact]
2. [Action]
\`\`\`

## Formatting rules
- Use markdown tables, never bullet lists, for tabular data. Right-align numerics: \`---:\` in separator row.
- Currency: \`HK$ 1,234,567\` (with thousand separators).
- State the date range and row count when reporting on a period (e.g. "Based on 142 invoices, 2025-04-01 → 2025-04-30").
- \`### Heading\` for sections, \`**bold**\` for key numbers.
- No filler. No "I hope this helps". No re-stating the question.
- Render a chart whenever a trend, breakdown, or comparison would clarify — keep ≤12 data points per chart.

Resolve vague dates ("last month", "YTD", "this quarter") yourself before calling tools.`;

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
    const chartSpecs: any[] = [];

    // Models: try Pro first for better reasoning, fall back to Flash if Pro is rate-limited / out of credits / down
    const PRIMARY_MODEL = "google/gemini-2.5-pro";
    const FALLBACK_MODEL = "google/gemini-2.5-flash";
    let currentModel = PRIMARY_MODEL;

    // Tool-calling loop (up to 10 iterations so the model can chain queries)
    for (let iter = 0; iter < 10; iter++) {
      // Retry transient gateway failures (502/503/504) up to 3 times with backoff
      let resp: Response | null = null;
      let lastStatus = 0;
      let lastText = "";
      for (let attempt = 0; attempt < 3; attempt++) {
        resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: currentModel,
            messages: conversation,
            tools,
            tool_choice: "auto",
          }),
        });
        if (resp.ok) break;
        lastStatus = resp.status;
        lastText = await resp.text();
        // If Pro fails with rate-limit / credits / server error, fall back to Flash and retry once
        if (
          currentModel === PRIMARY_MODEL &&
          (lastStatus === 429 || lastStatus === 402 || (lastStatus >= 500 && lastStatus <= 504))
        ) {
          console.warn(`Pro model failed (${lastStatus}), falling back to Flash`);
          currentModel = FALLBACK_MODEL;
          continue;
        }
        if (lastStatus !== 502 && lastStatus !== 503 && lastStatus !== 504) break;
        console.warn(`Gateway ${lastStatus}, retry ${attempt + 1}/3`);
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }

      if (!resp || !resp.ok) {
        const status = lastStatus || 500;
        console.error("Gateway error", status, lastText);
        const msg =
          status === 429
            ? "Rate limit hit — please wait a moment and try again."
            : status === 402
              ? "AI credits exhausted. Please add funds in Settings → Workspace → Usage."
              : status >= 502 && status <= 504
                ? "AI service is temporarily unavailable. Please try again in a moment."
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
        const content = choice.content || "";
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            for (const spec of chartSpecs) {
              const evt = JSON.stringify({ chart: spec });
              controller.enqueue(encoder.encode(`data: ${evt}\n\n`));
            }
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
        if (tc.function.name === "render_chart") {
          chartSpecs.push(args);
          result = { ok: true, rendered: args.title || "chart" };
        } else {
          try {
            result = await runTool(tc.function.name, args);
          } catch (e) {
            result = { error: e instanceof Error ? e.message : String(e) };
          }
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
