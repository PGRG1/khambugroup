import { toast } from "sonner";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { autoCreateGrnFromInvoice } from "@/utils/autoCreateGrnFromInvoice";
import { runBaniScan } from "@/lib/baniRunScan";
import { uploadInvoiceSources, newlyCreatedPaths } from "@/utils/invoiceAttachments";
import { supabaseStorageAdapter } from "@/utils/invoiceAttachmentClient";
import { mapScannerReviewStatus, computeHeldAmount } from "@/utils/invoiceStatus";

export interface ScannerProductMasterEntry {
  id: string;
  supplier_entry_id?: string;
  internal_sku: string;
  external_sku: string;
  internal_product_name: string;
  supplier_product_name: string;
  purchase_unit_cost?: number;
  supplier?: string;
  purchase_unit?: string;
  stock_uom?: string;
  stock_qty?: number;
}

/** Fired after Bani books an invoice so an open Invoices list refreshes. */
export const INVOICE_BOOKED_EVENT = "bani:invoice-booked";

export type ScannerSaveMeta = { receivedDate?: string };
export type ScannerSaveDeps = {
  tenantId: string | null;
  userId: string;
  navigate: (path: string) => void;
  createRecord: (invoice: Record<string, any>, lines: any[], attachments: Record<string, any>[]) => Promise<string>;
};

/**
 * The one scanner save path (Scan Invoice screen and Bani chat): durable source
 * first, then one atomic invoice + lines + attachments transaction, then GRN.
 * Throws on any failure so the caller keeps its draft.
 */
export async function saveScannerInvoice(deps: ScannerSaveDeps, inv: any, lines: any[], files?: File[], meta?: ScannerSaveMeta): Promise<string> {
  const { tenantId } = deps;

  // Durable-before-data: the source document must exist in storage and be
  // verified BEFORE any invoice row is created. Any failure throws so the
  // scanner keeps the draft open and no orphan invoice is written.
  if (!files || files.length === 0) {
    toast.error("Source document missing — re-attach the scanned file before saving.");
    throw new Error("MISSING_SOURCE_ATTACHMENT");
  }
  if (!tenantId) {
    toast.error("No active client selected — invoice not saved.");
    throw new Error("MISSING_TENANT");
  }

  const storage = supabaseStorageAdapter();
  let stored;
  try {
    stored = await uploadInvoiceSources(
      storage,
      tenantId,
      inv.invoice_date,
      inv.invoice_number,
      files.map((f) => ({ name: f.name, type: f.type, size: f.size, blob: f })),
    );
  } catch (e: any) {
    console.error("[invoice-attachment] upload/verify failed", { invoice_number: inv.invoice_number, invoice_date: inv.invoice_date, error: e?.message });
    toast.error(`Attachment upload failed — invoice not saved. ${e?.message || ""}`);
    throw e;
  }

  const cleanupAttempt = async () => {
    const createdPaths = newlyCreatedPaths(stored);
    if (createdPaths.length > 0) await storage.remove(createdPaths).catch(() => undefined);
  };

  // Single DB transaction: invoice + line items + attachment metadata +
  // audit event. Nothing financial is written unless linkage commits.
  let createdId: string;
  try {
    createdId = await deps.createRecord(
      {
        ...inv,
        discount: inv.discount ?? 0,
        discount_type: (inv as any).discount_type === "refund" ? "refund" : "discount",
        status: inv.status === "paid" ? "paid" : "unpaid",
        review_status: mapScannerReviewStatus((inv as any).status),
        held_amount: (inv as any).status === "disputed" ? computeHeldAmount(lines as any) : 0,
        subtotal: lines.reduce((sum, line) => sum + line.total - line.tax_amount, 0),
        tax_amount: lines.reduce((sum, line) => sum + line.tax_amount, 0),
        total_amount: lines.reduce((sum, line) => sum + line.total, 0),
        entered_by: deps.userId,
      } as any,
      lines,
      stored.map((s) => ({
        bucket: s.bucket,
        path: s.path,
        original_name: s.original_name,
        mime_type: s.mime_type,
        size_bytes: s.size_bytes,
        checksum: s.checksum,
        sort_order: s.sort_order,
      })),
    );
  } catch (e: any) {
    console.error("[invoice-attachment] atomic scanner save failed", { invoice_number: inv.invoice_number, error: e?.message });
    await cleanupAttempt();
    toast.error(`Invoice not saved — ${e?.message || "attachment linkage failed"}.`);
    throw e;
  }
  const created = { id: createdId } as { id: string };

  // Auto-trigger Bani's post-scan analysis (non-blocking).
  if (created?.id && tenantId) {
    runBaniScan({ invoiceId: created.id, tenantId, force: true }).catch((e) =>
      console.warn("Bani auto-scan failed", e)
    );

    // Auto-create matching GRN from the scanner's receiving fields.
    const grnRes = await autoCreateGrnFromInvoice(created.id, {
      tenantId,
      userId: deps.userId,
      receivedDate: meta?.receivedDate,
    });
    if (grnRes.error) {
      console.error("Auto-GRN creation failed:", grnRes.error);
      toast.error("Invoice confirmed, but GRN creation failed — see console.");
    } else if (!grnRes.skipped && grnRes.grn) {
      const grnNo = grnRes.grn.grn_number;
      const action = {
        label: "View GRN",
        onClick: () => deps.navigate("/procurement/receiving"),
      };
      if (grnRes.disputed) {
        toast.warning(
          `Invoice confirmed with disputes. GRN ${grnNo} created — review disputed lines.`,
          { action }
        );
      } else {
        toast.success(
          `Invoice confirmed. GRN ${grnNo} created and posted to inventory.`,
          { action }
        );
      }
    }
  }
  return created.id;
}

/** Tenant's Items Master as the scanner matches it: one entry per supplier listing. */
export async function loadScannerProductMaster(tenantId: string | null): Promise<ScannerProductMasterEntry[]> {
  const [pm, ps] = await Promise.all([
    fetchAllRows("product_master", "id, internal_sku, internal_product_name, external_sku, supplier_product_name, supplier, purchase_unit_cost, purchase_unit, stock_uom, stock_qty", undefined, tenantId),
    fetchAllRows("product_suppliers", "id, product_master_id, supplier, external_sku, supplier_product_name, purchase_unit_cost, purchase_unit, stock_uom, stock_qty", undefined, tenantId),
  ]);
  const entries: ScannerProductMasterEntry[] = [];
  for (const p of pm) {
    const supplierEntries = ps.filter((s: any) => s.product_master_id === p.id);
    if (supplierEntries.length > 0) {
      for (const s of supplierEntries) {
        entries.push({
          id: p.id,
          supplier_entry_id: s.id,
          internal_sku: p.internal_sku,
          external_sku: s.external_sku ?? "",
          internal_product_name: p.internal_product_name,
          supplier_product_name: s.supplier_product_name || p.supplier_product_name || p.internal_product_name || "",
          purchase_unit_cost: s.purchase_unit_cost ?? p.purchase_unit_cost ?? 0,
          supplier: s.supplier || p.supplier || "",
          purchase_unit: s.purchase_unit || p.purchase_unit || "",
          stock_uom: s.stock_uom || p.stock_uom || "",
          stock_qty: s.stock_qty ?? p.stock_qty ?? 1,
        });
      }
    } else {
      entries.push({
        id: p.id,
        internal_sku: p.internal_sku,
        external_sku: p.external_sku || "",
        internal_product_name: p.internal_product_name,
        supplier_product_name: p.supplier_product_name || p.internal_product_name || "",
        purchase_unit_cost: p.purchase_unit_cost ?? 0,
        supplier: p.supplier || "",
        purchase_unit: p.purchase_unit || "",
        stock_uom: p.stock_uom || "",
        stock_qty: p.stock_qty ?? 1,
      });
    }
  }
  return entries;
}
