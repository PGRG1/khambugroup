import { sha256 } from "./salesEvidence.ts";
export async function retainDocument(admin: any, tenantId: string, userId: string, kind: "sales" | "invoice", base64: string, mime: string, name: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("Document must be nonempty and at most 10MB");
  const hash = await sha256(bytes);
  const path = `${tenantId}/documents/${userId}/${hash}`;
  const { error } = await admin.storage.from("sales-receipt-intake").upload(path, bytes, { contentType: mime, upsert: false });
  if (error) {
    const { data } = await admin.storage.from("sales-receipt-intake").download(path);
    if (!data || await sha256(new Uint8Array(await data.arrayBuffer())) !== hash) throw new Error("Original document could not be retained; nothing posted");
  }
  const { data, error: e } = await admin.from("document_read_jobs").upsert({ tenant_id: tenantId, uploaded_by: userId, kind, source_hash: hash, source_path: path, source_name: name.slice(0, 255), mime_type: mime }, { onConflict: "tenant_id,uploaded_by,kind,source_hash", ignoreDuplicates: true }).select("id").maybeSingle();
  if (e) throw e;
  if (data?.id) return data.id as string;
  const { data: old } = await admin.from("document_read_jobs").select("id").eq("tenant_id", tenantId).eq("uploaded_by", userId).eq("kind", kind).eq("source_hash", hash).single();
  if (!old?.id) throw new Error("Document retention record could not be read");
  return old.id as string;
}