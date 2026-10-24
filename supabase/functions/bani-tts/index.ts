// Bani voice mode — text to speech via the Lovable AI gateway
// (google/gemini-3.1-flash-tts-preview). Streams 24 kHz PCM SSE back to the client.
// Voice: Kore — calm, warm, professional.
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_CHARS = 600;
const GATEWAY = "https://ai.gateway.lovable.dev/v1/audio/speech";
const MODEL = "google/gemini-3.1-flash-tts-preview";
const VOICE = "Kore";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const { response: authResp } = await requireAuth(req, corsHeaders);
  if (authResp) return authResp;

  try {
    const body = await req.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return json({ error: "text required" }, 400);
    if (text.length > MAX_CHARS) return json({ error: `text too long (max ${MAX_CHARS} chars)` }, 400);

    const upstream = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
        },
        stream_format: "sse",
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text().catch(() => "");
      return json({ error: `Speech failed (${upstream.status}). ${t.slice(0, 200)}` }, 502);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Speech failed" }, 500);
  }
});
