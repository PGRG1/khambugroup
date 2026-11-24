// Held sales reports with lines the setup doesn't know: Bani suggests what they are, and once a
// manager has mapped them the report is checked again exactly like a new scan (receiptIntake).
import { z } from "npm:zod@3";
import { linesForVenue, matchRead } from "../_shared/setupReceipt.ts";
import { newLineNames, normalizeSuggestions, suggestPrompt } from "../_shared/newReportLines.ts";
import { loadSetup, defs } from "./setupRead.ts";
import { receiptIntake } from "./intake.ts";

const input = z.object({ tenantId: z.string().uuid(), intakeId: z.string().uuid() }).strict();

/** Client managers who can see the venue, or the Bani team. Uses only access_level / can_see_venue. */
async function loadForAnswer(admin: any, userId: string, authHeader: string, body: unknown) {
  const { tenantId, intakeId } = input.parse(body);
  const { data: intake } = await admin.from("sales_receipt_intakes")
    .select("id,tenant_id,venue_id,uploaded_by,scan_id,source_path,source_name,tentative_values,reasons,status")
    .eq("id", intakeId).eq("tenant_id", tenantId).maybeSingle();
  if (!intake || intake.status !== "needs_review") throw new Error("This report is no longer waiting");
  const { data: platform } = await admin.rpc("is_platform_admin", { _user_id: userId });
  if (platform !== true) {
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const user = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } } });
    const { data: level } = await user.rpc("access_level", { t: tenantId, area: "revenue" });
    const { data: venue } = intake.venue_id ? await user.rpc("can_see_venue", { t: tenantId, v: intake.venue_id }) : { data: false };
    if (Number(level ?? 0) < 2 || venue !== true) throw new Error("Only managers of this venue can answer this");
  }
  const setup = await loadSetup(admin, tenantId);
  if (!setup) throw new Error("This client is not set up line by line");
  const t = (intake.tentative_values ?? {}) as Record<string, unknown>;
  const read = matchRead({ ...t, lines: t.lines }, linesForVenue(setup, intake.venue_id).map((r) => defs([r])[0]));
  return { intake, read };
}

export async function suggestNewLines(admin: any, userId: string, authHeader: string, body: unknown) {
  const { intake, read } = await loadForAnswer(admin, userId, authHeader, body);
  // Lines still unknown now (some may have been mapped since the report was held).
  const names = newLineNames(intake.reasons).filter((n) => read.lines.some((l) => !l.known && l.printed.toLowerCase() === n.toLowerCase()));
  if (!names.length) return { lines: [] };
  const key = Deno.env.get("LOVABLE_API_KEY");
  let raw: unknown = null;
  if (key) {
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [{ role: "user", content: suggestPrompt(read.lines, names) }] }),
      });
      if (res.ok) raw = JSON.parse(String((await res.json()).choices?.[0]?.message?.content ?? "").trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, ""));
    } catch { raw = null; }
  }
  // Without an answer every line is asked, never guessed.
  return { lines: normalizeSuggestions(raw, read.lines, names) };
}

const mimeOf = (name: string) => /\.pdf$/i.test(name) ? "application/pdf" : /\.png$/i.test(name) ? "image/png" : /\.webp$/i.test(name) ? "image/webp" : /\.hei[cf]$/i.test(name) ? "image/heic" : "image/jpeg";
function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Check the held report again from its retained original, as the person who scanned it. */
export async function recheckIntake(admin: any, userId: string, authHeader: string, body: unknown) {
  const { intake } = await loadForAnswer(admin, userId, authHeader, body);
  const { data: file, error } = await admin.storage.from("sales-receipt-intake").download(intake.source_path);
  if (error || !file) throw new Error("The original report could not be opened");
  const result: any = await receiptIntake(admin, intake.uploaded_by, {
    tenantId: intake.tenant_id, scanId: intake.scan_id, imageBase64: base64(new Uint8Array(await file.arrayBuffer())),
    mimeType: mimeOf(intake.source_name), fileName: intake.source_name, tentative: intake.tentative_values,
  }, authHeader);
  // Still held: show today's reasons, not the old ones.
  if (result?.status !== "saved" && Array.isArray(result?.reasons)) {
    await admin.from("sales_receipt_intakes").update({ reasons: result.reasons }).eq("id", intake.id).eq("status", "needs_review");
  }
  return result;
}
