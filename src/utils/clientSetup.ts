import { supabase } from "@/integrations/supabase/client";

/**
 * A client's setup, read from their own data (nothing is ticked by hand). Shown read-only on the
 * control plane; the work itself happens in the client's Settings (their team, or Bani support after Enter).
 */
export const SETUP_STEPS = [
  { key: "business", label: "Business", what: "Company, venues and seats", href: "/settings?tab=business&section=company" },
  { key: "people", label: "People", what: "Your team and their roles", href: "/settings?tab=users" },
  { key: "suppliers", label: "Suppliers", what: "Who you buy from", href: "/settings?tab=master-data" },
  { key: "products", label: "Products", what: "What you buy, each on a category", href: "/settings?tab=master-data&md=products" },
  { key: "revenue", label: "Revenue setup", what: "Report lines and accounts", href: "/settings?tab=accounting&view=revenue" },
  { key: "purchasing", label: "Purchasing setup", what: "An account for each category", href: "/settings?tab=accounting&view=purchasing-setup" },
  { key: "books", label: "Books", what: "Start date and opening balances", href: "/settings?tab=accounting&view=books" },
] as const;
export type SetupKey = (typeof SETUP_STEPS)[number]["key"];
/** The seven steps, plus whether sales and invoices are flowing (decides Active). */
export type SetupState = Record<SetupKey, boolean> & { sales: boolean; invoice: boolean };

export function setupSummary(s: SetupState | undefined) {
  const total = SETUP_STEPS.length;
  const done = s ? SETUP_STEPS.filter((x) => s[x.key]).length : 0;
  const next = s ? SETUP_STEPS.find((x) => !s[x.key]) : undefined;
  return { done, total, pct: Math.round((done / total) * 100), label: done >= total ? "Complete" : next ? `Next: ${next.label}` : "" };
}

/** Live once sales and invoices are flowing; suspended stays suspended. */
export function clientStatus(stored: string, s: SetupState | undefined): "active" | "setup" | "suspended" {
  if (stored === "suspended") return "suspended";
  return s?.sales && s?.invoice ? "active" : "setup";
}

const has = async (table: string, tenantId: string, filter?: (q: any) => any) => {
  let q = (supabase as any).from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (filter) q = filter(q);
  const { count } = await q;
  return (count ?? 0) > 0;
};

/** One client's setup, read from their data. Used by the client's Settings › Setup and the control plane. */
export async function loadClientSetup(tenantId: string): Promise<SetupState> {
  const [company, venues, people, suppliers, products, lines, salesVersion, rules, books, sales, invoice] = await Promise.all([
    has("organizations", tenantId, (q) => q.not("name", "is", null)),
    has("venues", tenantId, (q) => q.eq("is_active", true)),
    (async () => {
      const { count } = await supabase.from("tenant_members").select("user_id", { count: "exact", head: true }).eq("tenant_id", tenantId).not("role", "in", "(platform_admin,super_admin)");
      return (count ?? 0) > 0;
    })(),
    has("suppliers", tenantId),
    has("product_master", tenantId),
    has("sales_report_lines", tenantId),
    has("sales_mapping_versions", tenantId),
    has("account_mapping_rules", tenantId, (q) => q.in("rule_type", ["procurement_category", "procurement_category_venue"])),
    has("app_config", tenantId, (q) => q.eq("key", "books_start_date")),
    has("sales_records", tenantId),
    has("invoices", tenantId),
  ]);
  return { business: company && venues, people, suppliers, products, revenue: lines || salesVersion, purchasing: rules, books, sales, invoice };
}
