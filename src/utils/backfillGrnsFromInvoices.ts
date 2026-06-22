import { supabase } from "@/integrations/supabase/client";
import { autoCreateGrnFromInvoice } from "./autoCreateGrnFromInvoice";

export interface BackfillSummary {
  created: number;
  skipped: number;
  failed: number;
  failures: Array<{ invoiceId: string; error: string }>;
  remainingWithoutGrn: number;
  grnCount: number;
}

/**
 * One-off historical backfill. For every invoice in the tenant where
 * grn_id IS NULL we sequentially call autoCreateGrnFromInvoice (which is
 * idempotent). All statuses are eligible per the migration plan.
 */
export async function backfillGrnsFromInvoices(opts: {
  tenantId: string;
  userId: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<BackfillSummary> {
  const { tenantId, userId, onProgress } = opts;
  const summary: BackfillSummary = {
    created: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    remainingWithoutGrn: 0,
    grnCount: 0,
  };

  // Page through all invoices missing a GRN
  const PAGE = 500;
  const invoiceIds: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("invoices")
      .select("id")
      .eq("tenant_id", tenantId)
      .is("grn_id", null)
      .order("invoice_date", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error("Backfill: failed to list invoices", error);
      throw new Error(error.message);
    }
    if (!data || data.length === 0) break;
    invoiceIds.push(...data.map((r: any) => r.id));
    if (data.length < PAGE) break;
  }

  const total = invoiceIds.length;
  console.log(`Backfill: starting for ${total} invoices (tenant ${tenantId})`);

  for (let i = 0; i < invoiceIds.length; i++) {
    const invoiceId = invoiceIds[i];
    try {
      const res = await autoCreateGrnFromInvoice(invoiceId, { tenantId, userId });
      if (res.error) {
        summary.failed++;
        summary.failures.push({ invoiceId, error: res.error });
        console.error("Failed to create GRN for invoice", invoiceId, res.error);
      } else if (res.skipped) {
        summary.skipped++;
        console.log("Skipped invoice", invoiceId, "— GRN already exists");
      } else if (res.grn) {
        summary.created++;
        console.log("GRN created for invoice", invoiceId, "→", res.grn.grn_number);
      }
    } catch (e: any) {
      summary.failed++;
      const msg = e?.message || String(e);
      summary.failures.push({ invoiceId, error: msg });
      console.error("Failed to create GRN for invoice", invoiceId, e);
    }
    if (onProgress) onProgress(i + 1, total);
  }

  console.log(
    `Backfill complete: ${summary.created} created, ${summary.skipped} skipped, ${summary.failed} failed`,
  );

  // Verification
  const { count: remaining } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("grn_id", null);
  summary.remainingWithoutGrn = remaining ?? 0;

  const { count: grnCount } = await supabase
    .from("goods_received_notes" as any)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  summary.grnCount = grnCount ?? 0;

  console.log("Verification:", {
    invoices_without_grn: summary.remainingWithoutGrn,
    goods_received_notes_total: summary.grnCount,
  });

  return summary;
}
