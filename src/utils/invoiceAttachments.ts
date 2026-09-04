/**
 * Durable invoice source-attachment helpers.
 *
 * Rule: a scanner-created invoice may never be persisted unless every source
 * file has been uploaded to durable storage AND verified to exist there.
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
  originalName: string;
  mimeType: string;
  size: number;
  order: number;
}

export interface StorageAdapter {
  /** Uploads a file, returning an error when it fails. */
  upload: (path: string, file: Blob | File, opts: { upsert: boolean; contentType?: string }) => Promise<{ error: { message: string } | null }>;
  /** Returns true when the object really exists at `path`. */
  exists: (path: string) => Promise<boolean>;
}

export const INVOICE_BUCKET = "invoice-files";

export function sanitizeSegment(value: string): string {
  return (value || "").trim().replace(/[^a-zA-Z0-9-_]/g, "_") || "unknown";
}

/** Deterministic paths => retrying a failed save re-uses the same object (idempotent). */
export function buildAttachmentPaths(
  invoiceDate: string,
  invoiceNumber: string,
  files: { name: string }[],
): string[] {
  const multi = files.length > 1;
  return files.map((f, i) => {
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const suffix = multi ? `_page${i + 1}` : "";
    return `${invoiceDate}/${sanitizeSegment(invoiceNumber)}${suffix}.${ext}`;
  });
}

/** True when the stored `file_url` column points at at least one durable object. */
export function hasDurableAttachment(fileUrl: string | null | undefined): boolean {
  return parseAttachmentPaths(fileUrl).length > 0;
}

export function parseAttachmentPaths(fileUrl: string | null | undefined): string[] {
  return (fileUrl || "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^blob:|^data:/i.test(p));
}

export class AttachmentUploadError extends Error {
  constructor(message: string, readonly path?: string) {
    super(message);
    this.name = "AttachmentUploadError";
  }
}

/**
 * Uploads every source file, in order, and verifies each object exists.
 * Throws on the first failure so no invoice row is ever created without its source.
 */
export async function uploadInvoiceSources(
  storage: StorageAdapter,
  invoiceDate: string,
  invoiceNumber: string,
  files: UploadableSource[],
  bucket: string = INVOICE_BUCKET,
): Promise<StoredAttachment[]> {
  if (!files.length) {
    throw new AttachmentUploadError("No source document to upload for this invoice.");
  }
  const paths = buildAttachmentPaths(invoiceDate, invoiceNumber, files);
  const stored: StoredAttachment[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = paths[i];
    const { error } = await storage.upload(path, file.blob, { upsert: true, contentType: file.type });
    if (error) throw new AttachmentUploadError(`Upload failed for ${file.name}: ${error.message}`, path);
    const ok = await storage.exists(path);
    if (!ok) throw new AttachmentUploadError(`Upload could not be verified for ${file.name}.`, path);
    stored.push({
      bucket,
      path,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size ?? (file.blob as File)?.size ?? 0,
      order: i,
    });
  }
  return stored;
}

export function attachmentsToColumns(stored: StoredAttachment[]): { file_url: string; file_name: string } {
  return {
    file_url: stored.map((s) => s.path).join(","),
    file_name: stored.map((s) => s.originalName).join(", "),
  };
}
