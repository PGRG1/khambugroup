import { supabase } from "@/integrations/supabase/client";
import { INVOICE_BUCKET, type StorageAdapter, type StoredAttachment } from "@/utils/invoiceAttachments";

/** Supabase-backed storage adapter used by the scanner and the repair flow. */
export function supabaseStorageAdapter(bucket: string = INVOICE_BUCKET): StorageAdapter {
  return {
    upload: (path, file, opts) =>
      supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: opts.upsert, contentType: opts.contentType })
        .then((r) => ({
          error: r.error ? { message: r.error.message, statusCode: (r.error as any).statusCode } : null,
        })),
    exists: async (path) => {
      const slash = path.lastIndexOf("/");
      const dir = slash > 0 ? path.slice(0, slash) : "";
      const base = slash > 0 ? path.slice(slash + 1) : path;
      const { data } = await supabase.storage.from(bucket).list(dir, { search: base, limit: 100 });
      return !!data?.some((o) => o.name === base);
    },
    remove: async (paths) => {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      return { error: error ? { message: error.message } : null };
    },
  };
}

/**
 * Links verified durable attachments to an invoice atomically (metadata rows,
 * legacy file columns and the audit event in one transaction, tenant scoped).
 */
export async function linkInvoiceAttachments(
  tenantId: string,
  invoiceId: string,
  stored: StoredAttachment[],
  reason: "scanner" | "repair",
): Promise<void> {
  if (!tenantId) throw new Error("Tenant is required to link invoice attachments.");
  const payload = stored.map((s) => ({
    bucket: s.bucket,
    path: s.path,
    original_name: s.original_name,
    mime_type: s.mime_type,
    size_bytes: s.size_bytes,
    checksum: s.checksum,
    sort_order: s.sort_order,
  }));
  const { error } = await (supabase as any).rpc("link_invoice_attachments", {
    p_tenant_id: tenantId,
    p_invoice_id: invoiceId,
    p_attachments: payload,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}
