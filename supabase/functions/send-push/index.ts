// supabase/functions/send-push/index.ts
// Send a web-push notification to one or many subscriptions.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Body {
  subscription_ids?: string[]; // by id
  user_ids?: string[];         // all subs for users
  payload: {
    title: string;
    body?: string;
    url?: string;
    tag?: string;
    icon?: string;
    badge?: string;
    requireInteraction?: boolean;
    data?: Record<string, unknown>;
  };
}

async function loadVapid(client: ReturnType<typeof createClient>) {
  const { data, error } = await client
    .from("app_config")
    .select("key,value")
    .in("key", ["vapid_public_key", "vapid_private_key", "vapid_subject"]);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const row of data || []) map[row.key as string] = row.value as string;
  if (!map.vapid_public_key || !map.vapid_private_key) {
    throw new Error("VAPID keys not configured");
  }
  webpush.setVapidDetails(
    map.vapid_subject || "mailto:alerts@khambu.app",
    map.vapid_public_key,
    map.vapid_private_key,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    if (!body?.payload?.title) {
      return new Response(JSON.stringify({ error: "payload.title required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    await loadVapid(admin);

    let query = admin.from("push_subscriptions").select("id,endpoint,p256dh,auth,user_id");
    if (body.subscription_ids?.length) query = query.in("id", body.subscription_ids);
    else if (body.user_ids?.length) query = query.in("user_id", body.user_ids);

    const { data: subs, error } = await query;
    if (error) throw error;

    const json = JSON.stringify(body.payload);
    const results = await Promise.all(
      (subs || []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            json,
          );
          return { id: s.id, ok: true };
        } catch (err: any) {
          const status = err?.statusCode || 0;
          if (status === 404 || status === 410) {
            await admin.from("push_subscriptions").delete().eq("id", s.id);
          }
          return { id: s.id, ok: false, status, message: err?.message };
        }
      }),
    );
    const sent = results.filter((r) => r.ok).length;
    return new Response(JSON.stringify({ sent, total: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-push error", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
