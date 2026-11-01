import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveTenant } from "./auth.ts";
import { hkToday } from "./receiptAutoPost.ts";

// All background records stay scoped to tenant and permitted venues. Never trust prompt-supplied scope.
export async function documentContext(userId: string, requestedTenant: string | null, authHeader: string, kind: "sales" | "invoice") {
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const tenant = await resolveTenant(admin, userId, requestedTenant);
  if (!tenant) throw new Error("Document scope denied");
  const user = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } } });
  const { data: allVenues, error } = await user.from("venues").select("id,name,is_active").eq("tenant_id", tenant.tenant_id);
  if (error) throw error;
  const venues: { id: string; name: string; is_active: boolean }[] = [];
  for (const v of allVenues ?? []) {
    const { data: allowed } = await admin.rpc("user_has_venue", { _user_id: userId, _venue_id: v.id });
    if (allowed === true) venues.push(v);
  }
  const uploadedAt = new Date().toISOString();
  const today = hkToday();
  const start = new Date(Date.parse(today) - 60 * 86400_000).toISOString().slice(0, 10);
  const context: Record<string, unknown> = { todayHKT: today, uploadedAt, venues: venues.map(v => v.name) };
  if (kind === "sales") {
    const { data, error: e } = await user.rpc("document_sales_context", { p_tenant: tenant.tenant_id, p_start: start, p_end: today });
    if (e) throw e;
    context.sales = data;
  } else {
    const { data, error: e } = await user.from("invoices").select("supplier_id,invoice_date,invoice_number,total_amount,venue").eq("tenant_id", tenant.tenant_id).gte("invoice_date", start).in("venue", venues.map(v => v.name)).order("invoice_date", { ascending: false }).limit(80);
    if (e) throw e;
    const { data: suppliers } = await user.from("suppliers").select("id,name").eq("tenant_id", tenant.tenant_id);
    context.suppliers = suppliers;
    context.recentInvoices = data;
  }
  const { data: rules } = await user.from("ai_learned_rules").select("name,input_pattern,output_action").eq("tenant_id", tenant.tenant_id).eq("status", "active").in("workflow", kind === "sales" ? ["sales_receipt_extract"] : ["invoice_extract"]).limit(30);
  context.corrections = rules ?? [];
  return { tenantId: tenant.tenant_id, venues: venues.map(v => v.name), context, user, admin };
}