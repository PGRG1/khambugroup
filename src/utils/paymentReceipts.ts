/**
 * Optional payment-receipt attachments for the Record Payment workflow.
 *
 * Storage rules mirror the invoice-attachment engine (private bucket, tenant
 * prefixed, content-addressed, upsert=false, idempotent reuse, partial-upload
 * cleanup) — see `@/utils/invoiceAttachments`.
 */

import {
  AttachmentUploadError,
  sanitizeSegment,
  uploadInvoiceSources,
  type StorageAdapter,
  type StoredAttachment,
  type UploadableSource,
} from "@/utils/invoiceAttachments";

export const PAYMENT_RECEIPT_BUCKET = "payment-receipts";
export const PAYMENT_RECEIPT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file
/** Grouping segment used inside the tenant folder for payment receipts. */
export const PAYMENT_RECEIPT_SEGMENT = "payment-receipts";

export const PAYMENT_RECEIPT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/*";

const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
];
const ALLOWED_EXT = ["pdf", "jpg", "jpeg", "png", "heic", "heif"];

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Returns an error message, or null when the file is acceptable. */
export function validateReceiptFile(file: { name: string; type?: string; size?: number }): string | null {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const mime = (file.type || "").toLowerCase();
  const typeOk = ALLOWED_MIME.includes(mime) || ALLOWED_EXT.includes(ext);
  if (!typeOk) return `${file.name}: only PDF, JPEG, PNG or HEIC receipts are accepted.`;
  if ((file.size ?? 0) > PAYMENT_RECEIPT_MAX_BYTES) {
    return `${file.name}: file is ${formatFileSize(file.size ?? 0)} — the limit is 10 MB.`;
  }
  return null;
}

export function validateReceiptFiles(files: { name: string; type?: string; size?: number }[]): string[] {
  return files.map(validateReceiptFile).filter((m): m is string => !!m);
}

/** Deterministic tenant-prefixed folder for one payment's receipts. */
export function paymentReceiptFolder(tenantId: string, paymentDate: string): string {
  if (!tenantId) throw new AttachmentUploadError("Tenant is required for a payment receipt path.");
  return `${sanitizeSegment(tenantId)}/${sanitizeSegment(paymentDate)}/${PAYMENT_RECEIPT_SEGMENT}`;
}

/**
 * Uploads every selected receipt (idempotently reusing identical objects) and
 * verifies each one before returning. Throws after removing only the objects
 * this attempt created.
 */
export async function uploadPaymentReceipts(
  storage: StorageAdapter,
  tenantId: string,
  paymentDate: string,
  files: UploadableSource[],
): Promise<StoredAttachment[]> {
  const problems = validateReceiptFiles(files.map((f) => ({ name: f.name, type: f.type, size: f.size })));
  if (problems.length) throw new AttachmentUploadError(problems[0]);
  return uploadInvoiceSources(
    storage,
    tenantId,
    paymentDate,
    PAYMENT_RECEIPT_SEGMENT,
    files,
    PAYMENT_RECEIPT_BUCKET,
  );
}

/** Metadata payload for the atomic record_payment_with_receipts RPC. */
export function receiptMetadataPayload(stored: StoredAttachment[]) {
  return stored.map((s, i) => ({
    bucket: s.bucket,
    path: s.path,
    original_name: s.original_name,
    mime_type: s.mime_type,
    size_bytes: s.size_bytes,
    checksum: s.checksum,
    sort_order: s.sort_order ?? i,
  }));
}

/** Paths created by this attempt only — reused objects are never deleted. */
export function newlyCreatedPaths(stored: StoredAttachment[]): string[] {
  return stored.filter((s) => !s.reused).map((s) => s.path);
}
