import { supabase } from "@/integrations/supabase/client";

/**
 * A client's setup, read from their own data (nothing is ticked by hand). Shown read-only on the
 * control plane; the work itself happens in the client's Settings (their team, or Bani support after Enter).
 */
export const SETUP_STEPS = [
  { key: "company", label: "Company details" },
  { key: "venues", label: "Venues" },
  { key: "accounts", label: "Chart of accounts" },
  { key: "banks", label: "Bank accounts" },
  { key: "suppliers", label: "Suppliers" },
  { key: "team", label: "Team invited" },
  { key: "sales", label: "First sales" },
  { key: "invoice", label: "First invoice" },
] as const;
export type SetupKey = (typeof SETUP_STEPS)[number]["key"];
export type SetupState = Record<SetupKey, boolean>;

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

/** One client's setup. Platform admins only (the database rules decide what is readable). */
export async function loadClientSetup(tenantId: string): Promise<SetupState> {
  const [company, venues, accounts, banks, suppliers, team, sales, invoice] = await Promise.all([
    has("organizations", tenantId, (q) => q.not("name", "is", null)), // the BR number is optional for running Bani
    has("venues", tenantId, (q) => q.eq("is_active", true)),
    has("chart_of_accounts", tenantId),
    has("bank_accounts", tenantId),
    has("suppliers", tenantId),
    (async () => {
      const { count } = await supabase.from("tenant_members").select("user_id", { count: "exact", head: true }).eq("tenant_id", tenantId).not("role", "in", "(platform_admin,super_admin)");
      return (count ?? 0) > 0;
    })(),
    has("sales_records", tenantId),
    has("invoices", tenantId),
  ]);
  return { company, venues, accounts, banks, suppliers, team, sales, invoice };
}
