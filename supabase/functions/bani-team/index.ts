import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Bani team logins (control plane). Bani admins only: list the team, add someone (temporary password shown once,
// set their own at first sign-in), reset a password, remove someone. Team members hold platform_admin in the
// internal "Bani" business (slug bani-internal, status internal), so Bani access no longer lives inside a client.
const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const READABLE = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function temporaryPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const c = Array.from(bytes, (b) => READABLE[b % READABLE.length]).join("");
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
}
// The temporary password stays on the person (user_metadata.temp_password) until they set their own, so whoever
// manages them can show it again; SetOwnPassword clears it. It is never shown after 7 days.
const pendingMeta = (temp_password: string) => ({ must_set_password: true, temp_password, temp_password_set_at: new Date().toISOString() });
const WEEK = 7 * 24 * 60 * 60 * 1000;
const storedTemp = (meta: any): string | null => meta?.must_set_password && meta?.temp_password && Date.now() - Date.parse(String(meta.temp_password_set_at ?? "")) <= WEEK ? String(meta.temp_password) : null;
const BANI_ROLES = ["platform_admin", "super_admin"];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!auth?.toLowerCase().startsWith("bearer ")) throw new Error("Please sign in again");
    const token = auth.replace(/^[Bb]earer\s+/, "");
    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!);
    let callerId: string | null = null;
    const anyAuth = anon.auth as any;
    if (typeof anyAuth.getClaims === "function") { const { data } = await anyAuth.getClaims(token); callerId = data?.claims?.sub ?? null; }
    if (!callerId) { const { data } = await anon.auth.getUser(token); callerId = data?.user?.id ?? null; }
    if (!callerId) throw new Error("Please sign in again");
    const { data: mine } = await admin.from("tenant_members").select("role").eq("user_id", callerId).in("role", BANI_ROLES);
    if (!mine?.length) throw new Error("Only the Bani team can do this");

    // The internal Bani business that holds the team (created once).
    const { data: found } = await admin.from("tenants").select("id").eq("slug", "bani-internal").maybeSingle();
    let internalId = found?.id as string | undefined;
    if (!internalId) {
      const { data: made, error } = await admin.from("tenants").insert({ name: "Bani", slug: "bani-internal", status: "internal", users_managed_by: "bani" }).select("id").single();
      if (error || !made) throw new Error("Could not set up the Bani team: " + (error?.message ?? ""));
      internalId = made.id;
    }
    const { data: callerUser } = await admin.auth.admin.getUserById(callerId);
    const log = (action: string, target: string, title: string) => admin.from("audit_log").insert({ tenant_id: internalId, user_id: callerId, user_display_name: callerUser?.user?.email ?? null, action, entity_type: "bani_team", entity_id: target, details: { title } });

    const body = req.method === "POST" ? await req.json() : { action: "list" };
    const teamIds = async () => {
      const { data } = await admin.from("tenant_members").select("user_id").in("role", BANI_ROLES);
      return [...new Set((data ?? []).map((r: any) => r.user_id as string))];
    };

    if (body.action === "list") {
      const ids = await teamIds();
      const people = [];
      for (const id of ids) {
        const { data } = await admin.auth.admin.getUserById(id);
        const u = data?.user; if (!u) continue;
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
        people.push({ id, email: u.email, name: (meta.display_name as string) || u.email, added: u.created_at, pending: !!meta.must_set_password, showable: !!storedTemp(meta), you: id === callerId });
      }
      people.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return json({ people });
    }

    if (body.action === "add") {
      const email = String(body.email ?? "").trim().toLowerCase(), name = String(body.name ?? "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email");
      // An existing login (for example a client owner) is given Bani access; no new password.
      let userId: string | null = null, created = false, password: string | null = null;
      for (let page = 1; page <= 20 && !userId; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        const hit = data?.users.find((u: any) => (u.email ?? "").toLowerCase() === email);
        if (hit) userId = hit.id;
        if (!data?.users.length || data.users.length < 200) break;
      }
      if (!userId) {
        password = temporaryPassword();
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name || email, ...(body.firstName ? { first_name: String(body.firstName).trim() } : {}), ...(body.lastName ? { last_name: String(body.lastName).trim() } : {}), ...pendingMeta(password) } });
        if (error || !data.user) throw new Error(error?.message ?? "Could not create the login");
        userId = data.user.id; created = true;
        // New sign-ups are auto-attached to KHAMBU by old database triggers; a Bani team login belongs to no client.
        await admin.from("tenant_members").delete().eq("user_id", userId).neq("tenant_id", internalId);
        await admin.from("user_page_permissions").delete().eq("user_id", userId);
        await admin.from("user_access_control").delete().eq("user_id", userId);
      }
      const { error: mErr } = await admin.from("tenant_members").insert({ tenant_id: internalId, user_id: userId, role: "platform_admin" });
      if (mErr && !String(mErr.code).includes("23505")) throw new Error("Could not add to the Bani team: " + mErr.message);
      await admin.from("user_roles").insert({ user_id: userId, role: "admin" }).then(() => {}, () => {});
      await log("bani_team_added", userId, `Added ${name || email} to the Bani team`);
      return json({ success: true, userId, created, tempPassword: password });
    }

    const target = String(body.user_id ?? "");
    if (!target) throw new Error("Pick a person");
    if (target === callerId) throw new Error(body.action === "remove" ? "You cannot remove yourself" : "Change your own password from your account");
    if (!(await teamIds()).includes(target)) throw new Error("This person is not on the Bani team");
    const { data: tu } = await admin.auth.admin.getUserById(target);
    const label = (tu?.user?.user_metadata as any)?.display_name || tu?.user?.email || "a team member";

    if (body.action === "show") {
      const kept = storedTemp(tu?.user?.user_metadata);
      if (!kept) throw new Error("There is no temporary password kept for them. Reset it to make a new one.");
      return json({ success: true, tempPassword: kept });
    }
    if (body.action === "reset") {
      const password = temporaryPassword();
      const { error } = await admin.auth.admin.updateUserById(target, { password, user_metadata: { ...(tu?.user?.user_metadata ?? {}), ...pendingMeta(password) } });
      if (error) throw error;
      await log("bani_team_password_reset", target, `Reset ${label}'s password`);
      return json({ success: true, tempPassword: password });
    }
    if (body.action === "remove") {
      const { error } = await admin.from("tenant_members").delete().eq("user_id", target).in("role", BANI_ROLES);
      if (error) throw error;
      await log("bani_team_removed", target, `Removed ${label} from the Bani team`);
      return json({ success: true });
    }
    throw new Error("Unknown action");
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
