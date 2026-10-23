// Plain-English progress labels for the Bani AI thinking line.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

function parse(d: unknown): Date | null {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const dt = new Date(`${d}T00:00:00Z`);
  return isNaN(dt.getTime()) ? null : dt;
}

const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** "1–23 Oct", "Oct 2026" (full month), "28 Sept – 3 Oct". Null if unusable. */
export function formatRange(from: unknown, to: unknown, short = false): string | null {
  const a = parse(from), b = parse(to);
  if (!a && !b) return null;
  if (!a || !b) {
    const d = (a || b)!;
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  }
  const sameMonth = a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
  if (sameMonth && a.getUTCDate() === 1 && b.getUTCDate() === lastDay(b.getUTCFullYear(), b.getUTCMonth())) {
    return short ? MONTHS[a.getUTCMonth()] : `${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  }
  if (sameMonth) return `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
  return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
}

function formatPeriod(year: unknown, month: unknown): string | null {
  if (typeof year !== "number") return null;
  if (typeof month === "number" && month >= 1 && month <= 12) return `${MONTHS[month - 1]} ${year}`;
  return String(year);
}

const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");
const venueOf = (v: unknown) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "all" ? v.trim() : "all venues");
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export type StepStatus = { label: string; kind: string };

export function toolStepLabel(name: string, args: any = {}): StepStatus {
  const a = args && typeof args === "object" ? args : {};
  const range = formatRange(a.date_from, a.date_to);
  switch (name) {
    case "get_sales_summary":
      return { label: join("Pulling sales", venueOf(a.venue), range), kind: "sales" };
    case "get_venue_performance":
      return { label: join("Comparing venue performance", range), kind: "sales" };
    case "get_invoice_summary":
    case "get_top_suppliers":
      return { label: join("Reviewing supplier invoices", range), kind: "invoices" };
    case "get_invoice_line_items":
      return { label: join("Going through invoice lines", str(a.supplier_name), str(a.product_search)), kind: "invoices" };
    case "get_supplier_price_trends":
      return { label: join("Tracing supplier price changes", range), kind: "prices" };
    case "get_cost_of_revenue":
      return { label: join("Weighing purchases against revenue", range), kind: "costs" };
    case "compare_periods": {
      const A = formatRange(a.period_a_from, a.period_a_to, true);
      const B = formatRange(a.period_b_from, a.period_b_to, true);
      return { label: A && B ? `Comparing ${A} with ${B}` : "Comparing two periods", kind: "sales" };
    }
    case "get_menu_costing":
      return { label: "Checking menu costs against target", kind: "menu" };
    case "get_inventory_status":
      return { label: "Checking stock levels", kind: "stock" };
    case "get_hr_summary":
      return { label: join("Comparing payroll with revenue", formatPeriod(a.year, a.month)), kind: "payroll" };
    case "get_forecast_vs_actual":
      return { label: join("Checking forecast against actuals", range), kind: "forecast" };
    case "get_pl_period":
      return { label: join("Reading your P&L", formatPeriod(a.year, a.month)), kind: "pl" };
    case "get_database_overview":
      return { label: "Looking at what's in your workspace", kind: "overview" };
    case "render_chart":
      return { label: "Building a chart", kind: "chart" };
    default:
      return { label: "Checking your data", kind: "overview" };
  }
}
