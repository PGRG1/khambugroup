import { supabase } from "@/integrations/supabase/client";
import { INVOICE_BUCKET } from "@/utils/invoiceAttachments";

/** Optional photos of what arrived, kept on the invoice as proof. Never blocks booking. */
export type DeliveryPhoto = { id: string; path: string; original_name: string; taken_by_name: string | null; taken_at: string };

const MAX_BYTES = 15 * 1024 * 1024;

export function deliveryPhotoPath(tenantId: string, invoiceId: string, fileName: string, id: string): string {
  const ext = (fileName.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `${tenantId}/delivery/${invoiceId}/${id}.${ext}`;
}

/** Only images under 15 MB are kept as delivery photos. */
export function usableDeliveryPhotos(files: File[]): File[] {
  return files.filter(f => f.type.startsWith("image/") && f.size > 0 && f.size <= MAX_BYTES);
}

/** Uploads the photos and records them on the invoice. Returns how many were saved. */
export async function saveDeliveryPhotos(tenantId: string, invoiceId: string, userId: string, files: File[]): Promise<number> {
  const photos = usableDeliveryPhotos(files);
  if (!photos.length) return 0;
  const { data: me } = await supabase.from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
  const rows: Record<string, unknown>[] = [];
  for (const f of photos) {
    const path = deliveryPhotoPath(tenantId, invoiceId, f.name, crypto.randomUUID());
    const up = await supabase.storage.from(INVOICE_BUCKET).upload(path, f, { upsert: false, contentType: f.type });
    if (up.error) throw new Error(up.error.message);
    rows.push({ tenant_id: tenantId, invoice_id: invoiceId, bucket: INVOICE_BUCKET, path, original_name: f.name || "photo.jpg", mime_type: f.type, size_bytes: f.size, taken_by: userId, taken_by_name: me?.display_name ?? null });
  }
  const { error } = await (supabase as any).from("invoice_delivery_photos").insert(rows);
  if (error) {
    await supabase.storage.from(INVOICE_BUCKET).remove(rows.map(r => String(r.path))).catch(() => undefined);
    throw new Error(error.message);
  }
  return rows.length;
}

export async function loadDeliveryPhotos(tenantId: string, invoiceId: string): Promise<(DeliveryPhoto & { url: string })[]> {
  const { data } = await (supabase as any).from("invoice_delivery_photos").select("id,path,original_name,taken_by_name,taken_at").eq("tenant_id", tenantId).eq("invoice_id", invoiceId).order("taken_at");
  const list = (data || []) as DeliveryPhoto[];
  const signed = await Promise.all(list.map(p => supabase.storage.from(INVOICE_BUCKET).createSignedUrl(p.path, 3600)));
  return list.map((p, i) => ({ ...p, url: signed[i].data?.signedUrl || "" })).filter(p => p.url);
}
