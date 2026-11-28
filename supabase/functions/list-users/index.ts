import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin (signing-keys compatible)
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) throw new Error("Unauthorized");
    const token = authHeader.replace(/^[Bb]earer\s+/, "");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey);
    let callerId: string | null = null;
    const anySb = callerClient.auth as any;
    if (typeof anySb.getClaims === "function") {
      const { data, error } = await anySb.getClaims(token);
      if (error || !data?.claims?.sub) throw new Error("Unauthorized");
      callerId = data.claims.sub;
    } else {
      const { data, error } = await callerClient.auth.getUser(token);
      if (error || !data?.user) throw new Error("Unauthorized");
      callerId = data.user.id;
    }

    // Only this client's people, for someone in this client (or Bani staff). Never everyone's emails.
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const tenantId = String((body as { tenant_id?: string }).tenant_id ?? "");
    if (!tenantId) throw new Error("Pick a business");
    const { data: callerMemberships } = await supabaseAdmin.from("tenant_members").select("tenant_id, role").eq("user_id", callerId);
    const callerIsSuper = (callerMemberships ?? []).some((m: any) => ["super_admin", "platform_admin"].includes(String(m.role)));
    const callerInTenant = (callerMemberships ?? []).some((m: any) => m.tenant_id === tenantId);
    if (!callerIsSuper && !callerInTenant) throw new Error("No access to this business");
    if (!callerIsSuper) {
      const { data: roleCheck } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin");
      if (!roleCheck?.length) throw new Error("Admin only");
    }

    const { data: members, error } = await supabaseAdmin.from("tenant_members").select("user_id").eq("tenant_id", tenantId);
    if (error) throw error;
    const WEEK = 7 * 24 * 60 * 60 * 1000;
    const userList = (await Promise.all((members ?? []).map(async (m: any) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
      const u = data?.user;
      if (!u) return null;
      const meta = (u.user_metadata ?? {}) as any;
      const pending = !!meta.must_set_password;
      return {
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        // Still on a temporary password (added or reset, has not set their own yet).
        pending_password: pending,
        // That temporary password can still be shown (kept, and under 7 days old); otherwise only Reset works.
        temp_showable: pending && !!meta.temp_password && Date.now() - Date.parse(String(meta.temp_password_set_at ?? "")) <= WEEK,
      };
    }))).filter(Boolean);

    return new Response(
      JSON.stringify({ users: userList }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
