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

    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization")!;
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user: caller } } = await callerClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!caller) throw new Error("Unauthorized");

    const { email, displayName, position, tenant_id: requestedTenantId, role = "member" } = await req.json();
    if (!email) throw new Error("Email is required");

    // Resolve which tenant to add the new user to.
    // - Caller must be either super_admin OR a tenant_admin/admin of that tenant.
    const { data: callerMemberships } = await supabaseAdmin
      .from("tenant_members")
      .select("tenant_id, role")
      .eq("user_id", caller.id);
    if (!callerMemberships || callerMemberships.length === 0) throw new Error("No tenant access");

    const callerIsSuper = callerMemberships.some((m: any) => m.role === "super_admin");
    const tenantId = requestedTenantId || callerMemberships[0].tenant_id;
    const callerInTenant = callerMemberships.find((m: any) => m.tenant_id === tenantId);
    const callerCanManage = callerIsSuper || (callerInTenant && ["tenant_admin", "admin"].includes(String(callerInTenant.role)));
    if (!callerCanManage) throw new Error("Admin only");

    // Also enforce the legacy global admin role check.
    const { data: roleCheck } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .in("role", ["admin", "super_admin"]);
    if ((!roleCheck || roleCheck.length === 0) && !callerIsSuper) throw new Error("Admin only");

    // Create user with a random password; they'll set via reset link
    const tempPassword = crypto.randomUUID() + "Aa1!";
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { display_name: displayName || email },
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

    // Send password reset email so user can set their own password
    const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    return new Response(
      JSON.stringify({ success: true, userId: newUserId, tenant_id: tenantId, resetSent: !resetError }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
