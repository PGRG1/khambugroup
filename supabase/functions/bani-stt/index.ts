// Bani voice mode — speech to text via the Lovable AI gateway (openai/gpt-transcribe).
// Tenant-scoped: a short vocabulary hint (venue, supplier and item names) is built
// from the caller's own workspace so restaurant terms transcribe well.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireAuth, resolveTenant } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
const GATEWAY = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";
const MODEL = "openai/gpt-transcribe";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Vocabulary hint: venue names + up to 100 supplier / item names, tenant-scoped. */
async function loadVocab(admin: ReturnType<typeof createClient>, tenantId: string): Promise<string[]> {
  try {
    const [{ data: venues }, { data: suppliers }, { data: items }] = await Promise.all([
      admin.from("venues").select("name").eq("tenant_id", tenantId).eq("is_active", true).limit(50),
      admin.from("suppliers").select("name").eq("tenant_id", tenantId).limit(50),
      admin.from("product_master").select("internal_product_name").eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }).limit(50),
    ]);
    const names = [
      ...((venues ?? []) as any[]).map((v) => v.name),
      ...((suppliers ?? []) as any[]).map((s) => s.name),
      ...((items ?? []) as any[]).map((p) => p.internal_product_name),
    ];
    return [...new Set(names.filter((n) => typeof n === "string" && n.trim()))].slice(0, 110);
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const { user, response: authResp } = await requireAuth(req, corsHeaders);
  if (authResp) return authResp;

  try {
    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > MAX_AUDIO_BYTES + 64 * 1024) return json({ error: "Audio too large (max 10 MB)." }, 413);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return json({ error: "Audio file required." }, 400);
    if (file.size > MAX_AUDIO_BYTES) return json({ error: "Audio too large (max 10 MB)." }, 413);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const tenantField = form.get("tenant_id");
    const resolved = await resolveTenant(
      admin,
      user!.id,
      typeof tenantField === "string" && tenantField.trim() ? tenantField.trim() : null,
    );
    if (!resolved) return json({ error: "Forbidden: no tenant access" }, 403);

    const vocab = await loadVocab(admin, resolved.tenant_id);

    const upstream = new FormData();
    upstream.append("model", MODEL);
    // MediaRecorder can label audio-only webm as video/webm; normalise to audio/*.
    // Keep the extension consistent with the actual container — the provider
    // rejects files whose name and content disagree.
    const mime = file.type.startsWith("audio/") ? file.type : "audio/webm";
    const ext =
      mime.includes("webm") ? "webm"
        : mime.includes("mp4") ? "m4a"
          : mime.includes("mpeg") ? "mp3"
            : mime.includes("wav") ? "wav"
              : mime.includes("ogg") ? "ogg"
                : "webm";
    upstream.append("file", new File([file], `question.${ext}`, { type: mime }));
    upstream.append("response_format", "json");
    upstream.append("stream", "true");
    upstream.append(
      "prompt",
      "A staff member at a Hong Kong restaurant group asking their finance assistant a question. " +
        "Speech may be English, Cantonese, Nepali, Hindi, Tagalog or Indonesian, possibly mixed. " +
        "Expect venue, supplier and product names.",
    );
    if (vocab.length) upstream.append("keywords", vocab.join(", "));

    const resp = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")!}` },
      body: upstream,
    });
    if (!resp.ok || !resp.body) {
      const t = await resp.text().catch(() => "");
      return json({ error: `Transcription failed (${resp.status}). ${t.slice(0, 200)}` }, 502);
    }

    // Parse the SSE stream: transcript.text.delta appends, transcript.text.done is final.
    const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let text = "";
    let finalText = "";
    let language: string | null = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "transcript.text.delta" && typeof ev.delta === "string") text += ev.delta;
          if (ev.type === "transcript.text.done") {
            if (typeof ev.text === "string" && ev.text.trim()) finalText = ev.text;
            if (typeof ev.language === "string") language = ev.language;
          }
          if (ev.type === "error") throw new Error("Transcription stream error");
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }

    const out = (finalText || text).trim();
    return json({ text: out, language });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Transcription failed" }, 500);
  }
});
