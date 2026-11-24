// Reads a sales report for a client set up line by line (see _shared/setupReceipt.ts).
// Used for the first read (parse-receipt) and, with a different model, the independent second read (intake).
import { chatImage, chatPDF } from "../_shared/documentMedia.ts";
import { isSetupMode, linesForVenue, matchRead, setupReadPrompt, type SetupKind, type SetupLineDef } from "../_shared/setupReceipt.ts";

export type SetupRow = { venue_id: string | null; printed_name: string; kind: string; legacy_field: string | null; is_active: boolean; aliases?: string[] | null };

/** The client's setup, when it is read line by line; null for clients on fixed fields (KHAMBU). */
export async function loadSetup(admin: any, tenantId: string): Promise<SetupRow[] | null> {
  const { data } = await admin.from("sales_report_lines").select("venue_id,printed_name,kind,legacy_field,is_active,aliases").eq("tenant_id", tenantId).eq("is_active", true);
  const rows = (data ?? []) as SetupRow[];
  return isSetupMode(rows) ? rows : null;
}

export const defs = (rows: SetupRow[]): SetupLineDef[] => rows.map((r) => ({ printed: r.printed_name, kind: r.kind as SetupKind, aliases: r.aliases ?? [] }));

/** One read of the report; lines are matched to the setup of the venue it names. */
export async function readWithSetup(admin: any, tenantId: string, rows: SetupRow[], venues: string[], imageBase64: string, mimeType: string, fileName: string, model: string) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return { ok: false as const, status: 500, error: "AI not configured" };
  const known = [...new Map(defs(rows).map((d) => [d.printed.toLowerCase(), d])).values()];
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [
      { role: "system", content: setupReadPrompt(known, venues) },
      { role: "user", content: [mimeType === "application/pdf" ? chatPDF(fileName || "report.pdf", imageBase64) : chatImage(`data:${mimeType};base64,${imageBase64}`), { type: "text", text: "Read this report." }] },
    ] }),
  });
  if (!res.ok) return { ok: false as const, status: res.status, error: "Bani cannot read this report right now" };
  const text = String((await res.json()).choices?.[0]?.message?.content ?? "").trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false as const, status: 422, error: "Could not read this report. Try a clearer image." }; }
  const venueName = String((raw as Record<string, unknown>)?.venue ?? "").trim();
  const { data: venue } = venueName ? await admin.from("venues").select("id").eq("tenant_id", tenantId).eq("name", venueName).maybeSingle() : { data: null };
  return { ok: true as const, read: matchRead(raw, defs(linesForVenue(rows, venue?.id ?? null))) };
}
