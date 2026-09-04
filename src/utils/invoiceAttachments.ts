/**
 * Durable invoice source-attachment helpers.
 *
 * Rules enforced here:
 *  - A scanner-created invoice may never be persisted unless every source file
 *    has been uploaded to durable storage AND verified to exist there.
 *  - Storage keys are tenant scoped and content addressed (SHA-256), so two
 *    tenants (or two different binaries) with the same invoice date/number can
 *    never collide, and a retry of the same binary re-uses the same object.
 *  - Uploads never blindly overwrite: upsert is disabled; an existing object at
 *    the deterministic checksum path is verified and reused as an idempotent retry.
 *  - If a later file in a multi-file scan fails, only objects created by that
 *    attempt are removed; reused pre-existing objects are left untouched.
 */

export interface UploadableSource {
  name: string;
  type?: string;
  size?: number;
  blob: Blob | File;
}

export interface StoredAttachment {
  bucket: string;
  path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  checksum: string;
  sort_order: number;
  /** true when the object already existed and was reused (idempotent retry). */
  reused: boolean;
}

export interface StorageAdapter {
  upload: (
    path: string,
    file: Blob | File,
    opts: { upsert: boolean; contentType?: string },
  ) => Promise<{ error: { message: string; statusCode?: string } | null }>;
  exists: (path: string) => Promise<boolean>;
  remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
}

export const INVOICE_BUCKET = "invoice-files";

export class AttachmentUploadError extends Error {
  constructor(message: string, readonly path?: string) {
    super(message);
    this.name = "AttachmentUploadError";
  }
}

export function sanitizeSegment(value: string): string {
  return (value || "").trim().replace(/[^a-zA-Z0-9-_]/g, "_") || "unknown";
}

function extOf(name: string): string {
  const raw = (name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return raw || "bin";
}

/** SHA-256 hex digest of the file contents (stable idempotency identifier). */
export async function checksumOf(blob: Blob | File): Promise<string> {
  const buf =
    typeof (blob as any).arrayBuffer === "function"
      ? await blob.arrayBuffer()
      : await new Response(blob as any).arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Deterministic, tenant-scoped, content-addressed object key.
 * Shape: tenantId/invoiceDate/sanitizedInvoiceNumber/order-checksumPrefix.ext
 */
export function buildAttachmentPath(
  tenantId: string,
  invoiceDate: string,
  invoiceNumber: string,
  order: number,
  checksum: string,
  fileName: string,
): string {
  if (!tenantId) throw new AttachmentUploadError("Tenant is required for a durable attachment path.");
  if (!checksum) throw new AttachmentUploadError("Checksum is required for a durable attachment path.");
  return [
    sanitizeSegment(tenantId),
    sanitizeSegment(invoiceDate),
    sanitizeSegment(invoiceNumber),
    `${order}-${checksum.slice(0, 16)}.${extOf(fileName)}`,
  ].join("/");
}

export async function buildAttachmentPaths(
  tenantId: string,
  invoiceDate: string,
  invoiceNumber: string,
  files: UploadableSource[],
): Promise<{ path: string; checksum: string }[]> {
  const out: { path: string; checksum: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const checksum = await checksumOf(files[i].blob);
    out.push({ checksum, path: buildAttachmentPath(tenantId, invoiceDate, invoiceNumber, i, checksum, files[i].name) });
  }
  return out;
}

export function parseAttachmentPaths(fileUrl: string | null | undefined): string[] {
  return (fileUrl || "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^blob:|^data:/i.test(p));
}

export function hasDurableAttachment(fileUrl: string | null | undefined): boolean {
  return parseAttachmentPaths(fileUrl).length > 0;
}

function looksLikeAlreadyExists(err: { message: string; statusCode?: string }): boolean {
  return /already exists|duplicate|resource already/i.test(err.message) || err.statusCode === "409";
}

/**
 * Uploads (or idempotently reuses) every source file in order and verifies each
 * object exists. Throws on the first unrecoverable failure after removing only
 * the objects this attempt created.
 */
export async function uploadInvoiceSources(
  storage: StorageAdapter,
  tenantId: string,
  invoiceDate: string,
  invoiceNumber: string,
  files: UploadableSource[],
  bucket: string = INVOICE_BUCKET,
): Promise<StoredAttachment[]> {
  if (!tenantId) throw new AttachmentUploadError("Tenant is required before storing an invoice source.");
  if (!files.length) throw new AttachmentUploadError("No source document to upload for this invoice.");

  const keys = await buildAttachmentPaths(tenantId, invoiceDate, invoiceNumber, files);
  const stored: StoredAttachment[] = [];
  const createdPaths: string[] = [];

  const rollback = async () => {
    if (createdPaths.length > 0) {
      try {
        await storage.remove(createdPaths);
      } catch (e) {
        console.warn("[invoice-attachment] cleanup of partial upload failed", e);
      }
    }
  };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const { path, checksum } = keys[i];
    let reused = false;

    const { error } = await storage.upload(path, file.blob, { upsert: false, contentType: file.type });
    if (error) {
      if (looksLikeAlreadyExists(error)) {
        // Same tenant, same invoice, same binary => idempotent retry, reuse the object.
        reused = true;
      } else {
        await rollback();
        throw new AttachmentUploadError(`Upload failed for ${file.name}: ${error.message}`, path);
      }
    } else {
      createdPaths.push(path);
    }

    let ok = false;
    try {
      ok = await storage.exists(path);
    } catch (e: any) {
      await rollback();
      throw new AttachmentUploadError(`Upload could not be verified for ${file.name}: ${e?.message || e}`, path);
    }
    if (!ok) {
      await rollback();
      throw new AttachmentUploadError(`Upload could not be verified for ${file.name}.`, path);
    }

    stored.push({
      bucket,
      path,
      original_name: file.name,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size ?? (file.blob as File)?.size ?? 0,
      checksum,
      sort_order: i,
      reused,
    });
  }

  return stored;
}

/** Objects created by this attempt only (safe to delete on rollback). */
export function newlyCreatedPaths(stored: StoredAttachment[]): string[] {
  return stored.filter((s) => !s.reused).map((s) => s.path);
}

export function attachmentsToColumns(stored: StoredAttachment[]): { file_url: string; file_name: string } {
  const ordered = [...stored].sort((a, b) => a.sort_order - b.sort_order);
  return {
    file_url: ordered.map((s) => s.path).join(","),
    file_name: ordered.map((s) => s.original_name).join(", "),
  };
}
