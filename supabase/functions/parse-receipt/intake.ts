import { z } from "npm:zod@3";
import { sha256 } from "../_shared/salesEvidence.ts";
import { resolveTenant } from "../_shared/auth.ts";
import { receiptReviewReasons } from "../_shared/receiptIntakePolicy.ts";

const schema = z.object({ tenantId: z.string().uuid(), scanId: z.string().uuid().nullable(),
  imageBase64: z.string().min(1).max(14_000_000), mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]),
  fileName: z.string().min(1).max(255), tentative: z.record(z.unknown()),
});

/** All receipts stay non-posting until independent field evidence is available. */
export async function receiptIntake(admin: any, userId: string, body: unknown) {
  const input = schema.parse(body);
  const tenant = await resolveTenant(admin, userId, input.tenantId);
  if (!tenant) throw new Error("Receipt scope denied");
  const { data: permitted } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
  const { data: manager } = await admin.rpc("has_role", { _user_id: userId, _role: "manager" });
  if (permitted !== true && manager !== true) throw new Error("Receipt upload not authorised");
  const { data: venue, error: venueError } = await admin.from("venues").select("id").eq("tenant_id", tenant.tenant_id).eq("name", String(input.tentative.venue ?? "")).maybeSingle();
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
  const reasons = receiptReviewReasons(original, input.tentative, !!venue, !!input.scanId);
  const { data: previous, error: lookupError } = await admin.from("sales_receipt_intakes").select("id,venue_id").eq("tenant_id", tenant.tenant_id).eq("source_sha256", hash).maybeSingle();
  if (lookupError) throw lookupError;
  if (previous) {
    if (previous.venue_id) {
      const { data: allowed } = await admin.rpc("user_has_venue", { _user_id: userId, _venue_id: previous.venue_id });
      if (allowed !== true) throw new Error("Venue scope denied");
    }
    return { status: "flagged", intakeId: previous.id, repeated: true };
  }
  const path = `${tenant.tenant_id}/${hash}`;
  const { error: uploadError } = await admin.storage.from("sales-receipt-intake").upload(path, bytes, { contentType: input.mimeType, upsert: false });
  if (uploadError) {
    // A prior interrupted upload or concurrent identical upload is reusable only after byte verification.
    const { data: stored } = await admin.storage.from("sales-receipt-intake").download(path);
    if (!stored || await sha256(new Uint8Array(await stored.arrayBuffer())) !== hash) throw new Error("Source upload failed; receipt was not saved");
  }
  const { data, error } = await admin.rpc("register_sales_receipt_intake", { p_tenant: tenant.tenant_id, p_venue: venue?.id ?? null, p_user: userId, p_scan: input.scanId, p_hash: hash, p_path: path, p_name: input.fileName, p_original: original, p_tentative: input.tentative, p_reasons: reasons });
  if (error) throw error;
  return data;
}