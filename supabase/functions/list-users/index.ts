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

    const { data: roleCheck } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin");
    if (!roleCheck || roleCheck.length === 0) throw new Error("Admin only");

    // List all users
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw error;

    const userList = users.map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      // Still on a temporary password (added or reset, has not set their own yet).
      pending_password: !!(u.user_metadata as any)?.must_set_password,
      // A temporary password can still be shown (same 7-day rule as create-user "show").
      temp_viewable: (() => { const m = u.user_metadata as any; return !!(m?.must_set_password && m?.temp_password && Date.now() - Date.parse(String(m.temp_password_set_at ?? "")) <= 7 * 24 * 60 * 60 * 1000); })(),
    }));

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
