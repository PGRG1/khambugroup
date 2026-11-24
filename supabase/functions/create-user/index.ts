import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Temporary passwords: 10 easy-to-read characters (no O/0, I/l/1) in groups, e.g. K7mP-r4Wx-9q.
// Shown once to whoever added the person; the person must set their own password at first sign-in
// (user_metadata.must_set_password), and the app refuses a temporary password older than 7 days.
const READABLE = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function temporaryPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const c = Array.from(bytes, (b) => READABLE[b % READABLE.length]).join("");
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
}
const pendingMeta = () => ({ must_set_password: true, temp_password_set_at: new Date().toISOString() });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify the caller (signing-keys compatible, same as list-users: getClaims first, getUser as fallback).
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) throw new Error("Please sign in again");
    const token = authHeader.replace(/^[Bb]earer\s+/, "");
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    let callerId: string | null = null;
    const anyAuth = callerClient.auth as any;
    if (typeof anyAuth.getClaims === "function") {
      const { data } = await anyAuth.getClaims(token);
      callerId = data?.claims?.sub ?? null;
    }
    if (!callerId) {
      const { data } = await callerClient.auth.getUser(token);
      callerId = data?.user?.id ?? null;
    }
    if (!callerId) throw new Error("Please sign in again");
    const { data: callerUser } = await supabaseAdmin.auth.admin.getUserById(callerId);
    const caller = { id: callerId, email: callerUser?.user?.email ?? null };

    const body = await req.json();
    const { email, displayName, position, tenant_id: requestedTenantId, role = "member" } = body;
    const resetting = body.action === "reset";
    if (!resetting && !email) throw new Error("Email is required");

    // Resolve which tenant to add the new user to.
    // - Caller must be either super_admin OR a tenant_admin/admin of that tenant.
    const { data: callerMemberships } = await supabaseAdmin
      .from("tenant_members")
      .select("tenant_id, role")
      .eq("user_id", caller.id);
    if (!callerMemberships || callerMemberships.length === 0) throw new Error("No tenant access");

    // Bani staff (platform/super admins) can add users to any client.
    const callerIsSuper = callerMemberships.some((m: any) => ["super_admin", "platform_admin"].includes(String(m.role)));
    const tenantId = requestedTenantId || callerMemberships[0].tenant_id;
    const callerInTenant = callerMemberships.find((m: any) => m.tenant_id === tenantId);
    // A client's own admins add users only once Bani has handed user management to them.
    const { data: tenantRow } = await supabaseAdmin.from("tenants").select("users_managed_by").eq("id", tenantId).maybeSingle();
    const clientManages = tenantRow?.users_managed_by === "client";
    const callerCanManage = callerIsSuper || (clientManages && callerInTenant && ["tenant_admin", "admin"].includes(String(callerInTenant.role)));
    if (!callerCanManage) throw new Error(clientManages ? "Admin only" : "Users for this business are managed by Bani");
    // Never let a request make someone a Bani platform/super admin or tenant owner-level role it can't grant.
    const allowedRoles = callerIsSuper ? ["member", "admin", "tenant_admin"] : ["member"];
    if (!allowedRoles.includes(String(role))) throw new Error("Role not allowed");

    // Also enforce the legacy global admin role check.
    const { data: roleCheck } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .in("role", ["admin", "super_admin"]);
    if ((!roleCheck || roleCheck.length === 0) && !callerIsSuper) throw new Error("Admin only");

    // Reset: a new temporary password for someone already in this business.
    if (resetting) {
      const target = String(body.user_id ?? "");
      if (!target) throw new Error("Pick a person");
      if (target === caller.id) throw new Error("Change your own password from your account");
      const { data: member } = await supabaseAdmin.from("tenant_members").select("role").eq("tenant_id", tenantId).eq("user_id", target).maybeSingle();
      if (!member) throw new Error("This person is not in the business");
      if (["platform_admin", "super_admin"].includes(String(member.role))) throw new Error("Bani team passwords are not reset here");
      const { data: access } = await supabaseAdmin.from("tenant_user_access").select("role_key").eq("tenant_id", tenantId).eq("user_id", target).maybeSingle();
      if (!callerIsSuper && (access?.role_key === "owner" || member.role === "tenant_admin")) throw new Error("Only Bani can reset an owner's password");
      const { data: existing, error: getError } = await supabaseAdmin.auth.admin.getUserById(target);
      if (getError || !existing?.user) throw new Error("Person not found");
      const password = temporaryPassword();
      const { error: updError } = await supabaseAdmin.auth.admin.updateUserById(target, { password, user_metadata: { ...(existing.user.user_metadata ?? {}), ...pendingMeta() } });
      if (updError) throw updError;
      await supabaseAdmin.from("audit_log").insert({ tenant_id: tenantId, user_id: caller.id, user_display_name: caller.email, action: "temporary_password_reset", entity_type: "people", entity_id: target, details: { title: `Reset ${existing.user.email ?? "a person"}'s password` } });
      return new Response(JSON.stringify({ success: true, userId: target, tempPassword: password }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create the account with a temporary password, shown once to whoever added them.
    const tempPassword = temporaryPassword();
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { display_name: displayName || email, ...pendingMeta() },
    });

    if (createError) throw createError;
    const newUserId = newUser.user?.id;

    if (newUserId) {
      // Attach the new user to the chosen tenant.
      await supabaseAdmin
        .from("tenant_members")
        .upsert({ user_id: newUserId, tenant_id: tenantId, role }, { onConflict: "user_id,tenant_id" });

      // Profile display name
      if (displayName) {
        await supabaseAdmin
          .from("profiles")
          .update({ display_name: displayName })
          .eq("user_id", newUserId);
      }

      // Make sure user_access_control row exists for THIS tenant.
      await supabaseAdmin
        .from("user_access_control")
        .upsert(
          { user_id: newUserId, tenant_id: tenantId, position: position ?? null },
          { onConflict: "user_id" },
        );
    }

    if (newUserId) await supabaseAdmin.from("audit_log").insert({ tenant_id: tenantId, user_id: caller.id, user_display_name: caller.email, action: "person_added", entity_type: "people", entity_id: newUserId, details: { title: `Added ${displayName || email}` } });

    return new Response(
      JSON.stringify({ success: true, userId: newUserId, tenant_id: tenantId, tempPassword }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
