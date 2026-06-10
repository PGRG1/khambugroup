// Shared JWT auth guard for edge functions.
// Returns { user } when authenticated, or a Response (401) to send back.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

export async function requireAuth(req: Request, corsHeaders: Record<string, string>) {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return {
      user: null,
      response: new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      ),
    };
  }
  try {
    const token = authHeader.replace(/^[Bb]earer\s+/, "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    // Prefer getClaims (works with signing-keys / asymmetric JWTs); fall back to getUser.
    const anySb = supabase.auth as any;
    if (typeof anySb.getClaims === "function") {
      const { data, error } = await anySb.getClaims(token);
      if (error || !data?.claims) {
        return {
          user: null,
          response: new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          ),
        };
      }
      return { user: { id: data.claims.sub, email: data.claims.email } as any, response: null as Response | null };
    }
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return {
        user: null,
        response: new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        ),
      };
    }
    return { user: data.user, response: null as Response | null };
  } catch {
    return {
      user: null,
      response: new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      ),
    };
  }
}
