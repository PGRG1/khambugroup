import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization")!;
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user: caller } } = await callerClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!caller) throw new Error("Unauthorized");

    const { data: roleCheck } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin");
    if (!roleCheck || roleCheck.length === 0) throw new Error("Admin only");

    const { email, displayName, position } = await req.json();
    if (!email) throw new Error("Email is required");

    // Create user with a random password; they'll set via reset link
    const tempPassword = crypto.randomUUID() + "Aa1!";
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { display_name: displayName || email },
    });

    if (createError) throw createError;

    // Update display name in profiles if provided
    if (displayName && newUser.user) {
      await supabaseAdmin
        .from("profiles")
        .update({ display_name: displayName })
        .eq("user_id", newUser.user.id);
    }

    // Update position if provided
    if (position && newUser.user) {
      await supabaseAdmin
        .from("user_access_control")
        .update({ position })
        .eq("user_id", newUser.user.id);
    }

    // Send password reset email so user can set their own password
    const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    return new Response(
      JSON.stringify({ success: true, userId: newUser.user?.id, resetSent: !resetError }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
