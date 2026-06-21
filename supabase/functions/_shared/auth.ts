// Shared JWT auth + tenant resolver for edge functions.
import { createClient } from "npm:@supabase/supabase-js@2";

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

export type ResolvedTenant = { tenant_id: string; role: string; isSuper: boolean };

/**
 * Resolve which tenant a caller is acting on.
 *  - If requestedTenantId is provided, verifies the caller is a member (or super_admin).
 *  - Otherwise returns the caller's first tenant.
 * Returns null when the caller has no membership or is not authorized for the requested tenant.
 */
export async function resolveTenant(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  requestedTenantId?: string | null,
): Promise<ResolvedTenant | null> {
  const { data: memberships } = await adminClient
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", userId);
  if (!memberships || memberships.length === 0) return null;

  const isSuper = memberships.some((m: any) => m.role === "super_admin");
  let tenantId = requestedTenantId || null;
  if (tenantId) {
    const allowed = isSuper || memberships.some((m: any) => m.tenant_id === tenantId);
    if (!allowed) return null;
  } else {
    tenantId = memberships[0].tenant_id as string;
  }
  const role = memberships.find((m: any) => m.tenant_id === tenantId)?.role
    || (isSuper ? "super_admin" : "member");
  return { tenant_id: tenantId!, role, isSuper };
}
