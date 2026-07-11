// Bani platform admin: provision a brand new client (tenant).
// Performs all steps with the service role and rolls back created rows on failure.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

type Body = {
  client_group_name: string;
  legal_entity_name: string;
  country: string;
  base_currency: string;
  timezone: string;
  financial_year_start: string;   // "MM-DD" e.g. "04-01"
  initial_venue_name: string;
  admin_name: string;
  admin_email: string;
};

const REQUIRED_FIELDS: (keyof Body)[] = [
  "client_group_name","legal_entity_name","country","base_currency",
  "timezone","financial_year_start","initial_venue_name","admin_name","admin_email",
];

// COA is loaded from public.coa_templates (default template code: f_and_b_hk).
// If the template row is missing (very old databases), a minimal fallback runs.
const FALLBACK_COA: Array<{code:string; name:string; account_type:string; normal_side:string; is_cash?: boolean; sort_order:number}> = [
  { code:"1000", name:"Cash on Hand",       account_type:"asset",     normal_side:"debit",  is_cash:true,  sort_order:10 },
  { code:"1010", name:"Bank — Operating",   account_type:"asset",     normal_side:"debit",  is_cash:true,  sort_order:20 },
  { code:"2000", name:"Accounts Payable",   account_type:"liability", normal_side:"credit", sort_order:60 },
  { code:"3000", name:"Owner's Equity",     account_type:"equity",    normal_side:"credit", sort_order:90 },
  { code:"4000", name:"Sales Revenue",      account_type:"revenue",   normal_side:"credit", sort_order:110 },
  { code:"5000", name:"Cost of Goods Sold", account_type:"cogs",      normal_side:"debit",  sort_order:140 },
  { code:"6000", name:"Salaries & Wages",   account_type:"opex",      normal_side:"debit",  sort_order:150 },
];


const DEFAULT_PAGES = [
  { key:"revenue",     label:"Revenue" },
  { key:"kpis",        label:"KPI Management" },
  { key:"finance",     label:"Finance" },
  { key:"procurement", label:"Procurement" },
  { key:"expenses",    label:"Expenses" },
  { key:"payments",    label:"Payments & Settlements" },
  { key:"bank",        label:"Bank" },
  { key:"pettycash",   label:"Petty Cash" },
  { key:"people",      label:"People & HR" },
  { key:"admin",       label:"Admin" },
];

const DEFAULT_DEPARTMENTS = ["Management","Operations","Service","Kitchen","Bar","Admin & Finance"];
const DEFAULT_DOC_CATEGORIES = ["Invoices","Receipts","Bank Statements","Contracts","Licenses","Reports"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // --- Auth ---
  const { user, response: authErr } = await requireAuth(req, corsHeaders);
  if (authErr) return authErr;

  // Caller must be Bani platform_admin (or legacy super_admin)
  const { data: callerRoles } = await admin
    .from("tenant_members")
    .select("role")
    .eq("user_id", user!.id);
  const isPlatformAdmin = (callerRoles ?? []).some(
    (r: any) => r.role === "platform_admin" || r.role === "super_admin"
  );
  if (!isPlatformAdmin) {
    return new Response(JSON.stringify({ error: "Platform admin only" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- Validate input ---
  let body: Body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  for (const f of REQUIRED_FIELDS) {
    const v = (body as any)[f];
    if (typeof v !== "string" || v.trim().length === 0) {
      return new Response(JSON.stringify({ error: `Field "${f}" is required` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.admin_email)) {
    return new Response(JSON.stringify({ error: "Invalid admin_email" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!/^\d{2}-\d{2}$/.test(body.financial_year_start)) {
    return new Response(JSON.stringify({ error: "financial_year_start must be MM-DD" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // --- Duplicate guard ---
  const slugBase = slugify(body.client_group_name);
  if (!slugBase) {
    return new Response(JSON.stringify({ error: "Client group name produces empty slug" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  let slug = slugBase;
  for (let i = 1; i < 20; i++) {
    const { data: existing } = await admin.from("tenants").select("id").eq("slug", slug).maybeSingle();
    if (!existing) break;
    slug = `${slugBase}-${i+1}`;
  }
  {
    const { data: dup } = await admin.from("tenants").select("id")
      .ilike("name", body.client_group_name).maybeSingle();
    if (dup) {
      return new Response(JSON.stringify({ error: "A client with that group name already exists" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  // --- Rollback log ---
  const rollback: Array<() => Promise<void>> = [];
  const undoAll = async () => { for (let i = rollback.length-1; i >= 0; i--) try { await rollback[i](); } catch { /* swallow */ } };

  let tenantId: string | null = null;
  let venueId: string | null = null;
  let adminUserId: string | null = null;
  let createdNewUser = false;

  let organizationId: string | null = null;
  try {
    // 1. Create tenant (status='setup'). Typed columns for localisation live on tenants directly now.
    const { data: tenant, error: tErr } = await admin.from("tenants").insert({
      name: body.client_group_name.trim(),
      slug,
      status: "setup",
      plan: "standard",
      timezone: body.timezone,
      base_currency: body.base_currency,
      country: body.country,
      financial_year_start_year: null,
      financial_year_end: null,
    }).select("id").single();
    if (tErr || !tenant) throw new Error(tErr?.message || "tenant insert failed");
    tenantId = tenant.id as string;
    // Comprehensive rollback: wipe every row stamped with this tenant_id, then
    // the tenant itself. Order matters because of ON DELETE RESTRICT FKs.
    rollback.push(async () => {
      const tables = [
        "audit_log","user_page_permissions","user_access_control",
        "expense_categories","hr_departments","app_config","page_visibility",
        "venues_config","chart_of_accounts","tenant_members","venues",
        "organizations","tenant_onboarding",
      ];
      for (const t of tables) {
        await admin.from(t).delete().eq("tenant_id", tenantId!);
      }
      await admin.from("tenants").delete().eq("id", tenantId!);
    });

    // 1b. Seed the first organization (legal entity) BEFORE the venue — every
    //     venue must have an organization_id.
    const { data: org, error: oErr } = await admin.from("organizations").insert({
      tenant_id: tenantId,
      name: body.client_group_name.trim(),
      legal_name: body.legal_entity_name.trim(),
      industry: "food_and_beverage",
    }).select("id").single();
    if (oErr || !org) throw new Error("organization insert failed: " + (oErr?.message ?? ""));
    organizationId = org.id as string;

    // 2. First venue — linked to the organization we just created.
    const { data: venue, error: vErr } = await admin.from("venues").insert({
      tenant_id: tenantId,
      organization_id: organizationId,
      name: body.initial_venue_name.trim(),
      sort_order: 0,
      is_active: true,
    }).select("id").single();
    if (vErr || !venue) throw new Error("venue insert failed: " + (vErr?.message ?? ""));
    venueId = venue.id as string;
    rollback.push(async () => { await admin.from("venues").delete().eq("id", venueId!); });


    // 3. Client administrator — invite or reuse
    let existingUser: any = null;
    {
      // Page through users (admin.listUsers is paginated, default perPage=50)
      for (let page = 1; page <= 20 && !existingUser; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) { console.error("listUsers error", error); break; }
        existingUser = data.users.find((u: any) => (u.email ?? "").toLowerCase() === body.admin_email.toLowerCase());
        if (!data.users.length || data.users.length < 200) break;
      }
    }
    if (existingUser) {
      adminUserId = existingUser.id;
    } else {
      // Call GoTrue admin endpoint directly — the JS SDK swallows the real
      // error body and retries with a generic 500 message on Lovable Cloud.
      const resp = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
          "apikey": serviceKey,
        },
        body: JSON.stringify({
          email: body.admin_email,
          email_confirm: true,
          user_metadata: { display_name: body.admin_name },
        }),
      });
      const raw = await resp.text();
      if (!resp.ok) {
        console.error("createUser HTTP", resp.status, raw);
        throw new Error(`create admin user failed: HTTP ${resp.status} ${raw.slice(0,400)}`);
      }
      const created = JSON.parse(raw);
      adminUserId = created.id || created.user?.id;
      if (!adminUserId) throw new Error("create admin user failed: missing id in response");
      createdNewUser = true;
      rollback.push(async () => {
        if (createdNewUser && adminUserId) {
          await fetch(`${supabaseUrl}/auth/v1/admin/users/${adminUserId}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${serviceKey}`, "apikey": serviceKey },
          }).catch(() => {});
        }
      });
    }

    // 3b. If a new auth user was created, the legacy `on_auth_user_created_tenant`
    //     trigger auto-attaches them to KHAMBU Group as a member. The new client
    //     admin must see ONLY their own tenant — strip any other memberships.
    if (createdNewUser && adminUserId) {
      await admin.from("tenant_members")
        .delete()
        .eq("user_id", adminUserId)
        .neq("tenant_id", tenantId);
      await admin.from("user_access_control")
        .delete()
        .eq("user_id", adminUserId)
        .neq("tenant_id", tenantId);
      await admin.from("user_page_permissions")
        .delete()
        .eq("user_id", adminUserId)
        .neq("tenant_id", tenantId);
    }





    // 4. tenant_admin membership (idempotent thanks to unique key)
    {
      const { error } = await admin.from("tenant_members").insert({
        tenant_id: tenantId, user_id: adminUserId, role: "tenant_admin",
      });
      if (error && !`${error.code}`.includes("23505")) throw new Error("membership insert failed: " + error.message);
    }
    // Ensure user_access_control row for the new tenant_admin, scoped to this tenant.
    await admin.from("user_access_control").upsert(
      { user_id: adminUserId, tenant_id: tenantId, position: "owner", status: "active" },
      { onConflict: "user_id" },
    );

    rollback.push(async () => {
      await admin.from("tenant_members").delete()
        .eq("tenant_id", tenantId!).eq("user_id", adminUserId!).eq("role","tenant_admin");
    });

    // 5. Seed configuration
    // 5a. venues_config row for the initial venue
    {
      const { error } = await admin.from("venues_config").insert({
        tenant_id: tenantId,
        name: body.initial_venue_name.trim(),
        display_label: body.initial_venue_name.trim(),
        venue_type: "physical",
        is_active: true,
        include_in_dashboard: true,
        include_in_forecasting: true,
        include_in_inventory: true,
        include_in_payroll: true,
        historical_only: false,
        sort_order: 0,
      });
      if (error) throw new Error("venues_config seed failed: " + error.message);
    }

    // 5b. page_visibility defaults
    {
      const rows = DEFAULT_PAGES.map((p) => ({
        tenant_id: tenantId, page_key: p.key, page_label: p.label, visible_to_all: true,
      }));
      const { error } = await admin.from("page_visibility").insert(rows);
      if (error) throw new Error("page_visibility seed failed: " + error.message);
    }

    // 5c. Localisation lives on `tenants` typed columns now (set at insert time).
    //     app_config stays for other future untyped settings but no longer duplicates
    //     timezone/currency/country/legal_entity_name/client_group_name/financial_year_start.

    // 5d. default document categories (stored in expense_categories table as catch-all)
    //     and default departments
    {
      const rows = DEFAULT_DEPARTMENTS.map((n) => ({ tenant_id: tenantId, name: n, is_active: true }));
      const { error } = await admin.from("hr_departments").insert(rows);
      if (error) throw new Error("hr_departments seed failed: " + error.message);
    }
    {
      const rows = DEFAULT_DOC_CATEGORIES.map((n) => ({
        tenant_id: tenantId, name: n,

      }));
      const { error } = await admin.from("expense_categories").insert(rows);
      // If color column is non-nullable we'll retry without it; the seed is best-effort.
      if (error && error.code !== "23502") throw new Error("doc categories seed failed: " + error.message);
    }

    // 5e. Chart of accounts — pulled from public.coa_templates (`f_and_b_hk`).
    //     Falls back to a minimal inlined set if the template row is missing.
    {
      const { data: tpl } = await admin.from("coa_templates").select("template").eq("code","f_and_b_hk").maybeSingle();
      const source: any[] = (tpl?.template as any[]) ?? FALLBACK_COA;
      const rows = source.map((a: any) => ({
        tenant_id: tenantId,
        code: a.code, name: a.name,
        account_type: a.account_type, normal_side: a.normal_side,
        is_active: true, is_cash: !!a.is_cash, sort_order: a.sort_order,
      }));
      const { error } = await admin.from("chart_of_accounts").insert(rows);
      if (error) throw new Error("chart_of_accounts seed failed: " + error.message);
    }

    // 5f. Seed the onboarding cockpit row so the client opens at Phase 1 immediately.
    await admin.from("tenant_onboarding").upsert({
      tenant_id: tenantId, current_phase: 1, steps: {},
    }, { onConflict: "tenant_id" });

    // 6. Activate tenant now that >=1 venue and >=1 tenant_admin exist
    {
      const { error } = await admin.from("tenants").update({ status: "active" }).eq("id", tenantId);
      if (error) throw new Error("activate tenant failed: " + error.message);
    }



    // 7. Audit log
    await admin.from("audit_log").insert({
      tenant_id: tenantId,
      user_id: user!.id,
      user_display_name: (user as any)?.email ?? null,
      action: "tenant.provision",
      entity_type: "tenant",
      entity_id: tenantId,
      details: {
        client_group_name: body.client_group_name,
        legal_entity_name: body.legal_entity_name,
        country: body.country,
        base_currency: body.base_currency,
        timezone: body.timezone,
        financial_year_start: body.financial_year_start,
        initial_venue: body.initial_venue_name,
        admin_email: body.admin_email,
        created_new_user: createdNewUser,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      tenant_id: tenantId, slug, venue_id: venueId,
      admin_user_id: adminUserId, created_new_user: createdNewUser,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    await undoAll();
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
      rolled_back: true,
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
