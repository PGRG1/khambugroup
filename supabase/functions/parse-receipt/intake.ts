import { z } from "npm:zod@3";
import { sha256 } from "../_shared/salesEvidence.ts";
import { resolveTenant } from "../_shared/auth.ts";
import { receiptReviewReasons } from "../_shared/receiptIntakePolicy.ts";
import { figureProblems, hkToday, TENDERS, verificationMismatches } from "../_shared/receiptAutoPost.ts";

const schema = z.object({ tenantId: z.string().uuid(), scanId: z.string().uuid().nullable(),
  imageBase64: z.string().min(1).max(14_000_000), mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]),
  fileName: z.string().min(1).max(255), tentative: z.record(z.unknown()),
});

/** A second, independent read of the receipt with a different model; never sees the first read. */
async function independentRead(imageBase64: string, mimeType: string, venues: string[]): Promise<Record<string, unknown> | null> {
  const key = (globalThis as any).Deno?.env.get("LOVABLE_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-3.8-flash", messages: [
        { role: "system", content: `You verify restaurant end-of-day sales reports. Read ONLY what is printed. Return JSON with keys: date (YYYY-MM-DD trading date), venue (one of: ${venues.join(", ")}; null if unsure), subtotal, serviceCharge, discount, totalSales, ${TENDERS.join(", ")}. totalSales = subtotal + serviceCharge - discount. Use null for anything not printed or unreadable. Never guess. JSON only.` },
        { role: "user", content: [{ type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } }, { type: "text", text: "Read this report." }] },
      ] }),
    });
    if (!res.ok) return null;
    const text = String((await res.json()).choices?.[0]?.message?.content ?? "").trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    return JSON.parse(text);
  } catch { return null; }
}

export async function receiptIntake(admin: any, userId: string, body: unknown, authHeader: string) {
  const input = schema.parse(body);
  const tenant = await resolveTenant(admin, userId, input.tenantId);
  if (!tenant) throw new Error("Receipt scope denied");
  const { data: permitted } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: manager } = await admin.rpc("has_role", { _user_id: userId, _role: "manager" });
  if (permitted !== true && manager !== true) throw new Error("Receipt upload not authorised");
  const { data: venue, error: venueError } = await admin.from("venues").select("id,name").eq("tenant_id", tenant.tenant_id).eq("name", String(input.tentative.venue ?? "")).maybeSingle();
  if (venueError) throw venueError;
  if (venue) {
    const { data: allowed } = await admin.rpc("user_has_venue", { _user_id: userId, _venue_id: venue.id });
    if (allowed !== true) throw new Error("Venue scope denied");
  }
  const bytes = Uint8Array.from(atob(input.imageBase64), c => c.charCodeAt(0));
  if (bytes.length > 10 * 1024 * 1024) throw new Error("Maximum 10MB allowed");
  const hash = await sha256(bytes);
  let original: Record<string, unknown> = {};
  if (input.scanId) {
    const { data: scan } = await admin.from("sales_scan_extractions").select("original_values,source_sha256").eq("id", input.scanId).eq("tenant_id", tenant.tenant_id).eq("scanned_by", userId).maybeSingle();
    if (!scan || scan.source_sha256 !== hash) throw new Error("Extraction source mismatch");
    original = scan.original_values;
  }
  const { data: previous, error: lookupError } = await admin.from("sales_receipt_intakes").select("id,venue_id,status,posted_record_id").eq("tenant_id", tenant.tenant_id).eq("source_sha256", hash).maybeSingle();
  if (lookupError) throw lookupError;
  if (previous) {
    if (previous.venue_id) {
      const { data: allowed } = await admin.rpc("user_has_venue", { _user_id: userId, _venue_id: previous.venue_id });
      if (allowed !== true) throw new Error("Venue scope denied");
    }
    return { status: "flagged", intakeId: previous.id, repeated: true, reasons: [previous.status === "posted" ? "This receipt was already recorded" : "This receipt is already waiting for review"] };
  }

  // Decide whether this receipt may be recorded on its own.
  const t = input.tentative;
  const problems = figureProblems(t, !!venue, hkToday());
  if (!input.scanId) problems.push("Original scan audit unavailable");
  if (venue && !problems.some(p => p.startsWith("Trading date"))) {
    const date = String(t.date);
    const [{ data: existing }, { data: closed }] = await Promise.all([
      admin.from("sales_records").select("id,total_sales,report_number").eq("tenant_id", tenant.tenant_id).eq("venue", venue.name).eq("date", date),
      admin.from("venue_closures").select("id").eq("tenant_id", tenant.tenant_id).eq("venue_id", venue.id).eq("date", date).limit(1),
    ]);
    if (existing?.length) problems.push(`Sales already recorded for ${venue.name} on ${date} — not added again`);
    if (closed?.length) problems.push(`${venue.name} is marked closed on ${date}`);
  }
  let second: Record<string, unknown> | null = null;
  if (!problems.length) {
    const { data: vs } = await admin.from("venues").select("name").eq("tenant_id", tenant.tenant_id);
    second = await independentRead(input.imageBase64, input.mimeType, (vs ?? []).map((v: any) => v.name));
    problems.push(...verificationMismatches(t, second));
  }

  const path = `${tenant.tenant_id}/${hash}`;
  const { error: uploadError } = await admin.storage.from("sales-receipt-intake").upload(path, bytes, { contentType: input.mimeType, upsert: false });
  if (uploadError) {
    const { data: stored } = await admin.storage.from("sales-receipt-intake").download(path);
    if (!stored || await sha256(new Uint8Array(await stored.arrayBuffer())) !== hash) throw new Error("Source upload failed; receipt was not saved");
  }
  const reasons = problems.length ? problems : receiptReviewReasons(original, t, !!venue, !!input.scanId).slice(0, 0);
  const { data, error } = await admin.rpc("register_sales_receipt_intake", { p_tenant: tenant.tenant_id, p_venue: venue?.id ?? null, p_user: userId, p_scan: input.scanId, p_hash: hash, p_path: path, p_name: input.fileName, p_original: original, p_tentative: t, p_reasons: reasons });
  if (error) throw error;
  if (data?.repeated || problems.length) return { ...data, reasons: problems };

  // Verified and clean: record it as the user (their permissions apply).
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const ext = input.mimeType === "application/pdf" ? "pdf" : "jpg";
  const safeReport = String(t.reportNumber || "norpt").replace(/[^a-zA-Z0-9_-]/g, "_");
  const receiptPath = `${t.date}_${venue!.name}_${safeReport}_${Date.now()}.${ext}`;
  const { error: upErr } = await user.storage.from("sales-receipts").upload(receiptPath, bytes, { contentType: input.mimeType });
  const n = (k: string) => Number(t[k] ?? 0) || 0;
  const { data: inserted, error: insErr } = await user.from("sales_records").insert({
    tenant_id: tenant.tenant_id, date: t.date, day: t.day ?? new Date(String(t.date)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
    venue: venue!.name, report_number: String(t.reportNumber ?? ""), orders: n("orders"), guests: n("guests"),
    subtotal: n("subtotal"), service_charge: n("serviceCharge"), discount: -Math.abs(n("discount")), total_sales: n("totalSales"),
    visa: n("visa"), mastercard: n("mastercard"), amex: n("amex"), union_pay: n("unionPay"), jcb: n("jcb"), alipay: n("alipay"),
    wechat: n("wechat"), payme: n("payme"), cash: n("cash"), deliveroo: n("deliveroo"), foodpanda: n("foodpanda"), keeta: n("keeta"),
    card_tips: -Math.abs(n("cardTips")), receipt_file_url: upErr ? null : receiptPath, receipt_file_name: upErr ? null : input.fileName,
    service_period_id: t.servicePeriodId ?? null,
  }).select("id").single();
  if (insErr || !inserted?.id) {
    const why = insErr?.code === "23505" ? "Sales with this report number already exist — not added again" : "Automatic recording failed; kept for review";
    await admin.from("sales_receipt_intakes").update({ reasons: [why], verification: second }).eq("id", data.intakeId);
    return { ...data, reasons: [why] };
  }
  await admin.from("sales_receipt_intakes").update({ status: "posted", posted_record_id: inserted.id, verification: second, reasons: [] }).eq("id", data.intakeId);
  const { error: jErr } = await user.rpc("rebuild_journal_from_operations", { p_tenant_id: tenant.tenant_id });
  return { status: "saved", recordId: inserted.id, intakeId: data.intakeId, journal: jErr ? "failed" : "completed" };
}
