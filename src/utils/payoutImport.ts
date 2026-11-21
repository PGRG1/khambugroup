import { supabase } from "@/integrations/supabase/client";
import type { PaymentProcessor, ProcessorMerchant } from "@/hooks/usePaymentSettlements";

/**
 * Card payout reports: the one upload → read → save path for Cash › Card payouts and Bani chat.
 * Saving records what the processor paid (batches, lines, transactions); it never posts to the books.
 * The same payout (merchant, settlement/transaction day, gross, net) is never saved twice.
 */

export type PayoutLine = { payment_type: string; payment_type_label: string; count: number; gross_amount: number; fee_amount: number; net_amount: number; expected_fee: number; fee_variance: number; audit_status: string };
export type PayoutTxn = { transaction_time: string; payment_method_raw: string; payment_method_key: string; locality: string; merchant_number: string; gross_amount: number; fee_amount: number; net_amount: number; expected_fee: number; fee_variance: number; audit_status: string; reference: string; wallet_type?: string | null };
export type PayoutBatch = {
  merchant_number: string; merchant_label: string; transaction_date: string; settlement_date: string;
  gross_amount: number; fee_amount: number; points_offset: number; bank_transfer_fee: number; adjustments: number; frozen_amount: number; net_settlement: number;
  count: number; lines: PayoutLine[]; transactions: PayoutTxn[]; transactions_flagged: number; fee_variance: number; audit_status: string; audit_note: string;
};
export type PayoutRead = { batches: PayoutBatch[]; unknown_merchants: string[]; currency: string; monthly_audit: any[]; audit: any };

/** Store the file and create the import row (same as Card payouts › Upload). Returns the import id. */
export async function uploadPayoutFile(tenantId: string, processor: PaymentProcessor, file: File): Promise<string> {
  if (file.size > 100 * 1024 * 1024) throw new Error("File too large (max 100 MB)");
  const { data: { user } } = await supabase.auth.getUser();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${processor.type}/${stamp}_${file.name}`;
  const up = await supabase.storage.from("payment-statements").upload(path, file, { upsert: false });
  if (up.error) throw up.error;
  // Period from a "MM-YYYY" file name when there is one; the read sets the real dates per payout.
  const m = file.name.match(/(\d{2})[-_](\d{4})/);
  let periodStart = new Date().toISOString().slice(0, 10), periodEnd = periodStart;
  if (m) {
    const mm = parseInt(m[1], 10), yy = parseInt(m[2], 10);
    periodStart = new Date(yy, mm - 1, 1).toISOString().slice(0, 10);
    periodEnd = new Date(yy, mm, 0).toISOString().slice(0, 10);
  }
  const { data, error } = await supabase.from("payment_settlement_imports" as any).insert({
    tenant_id: tenantId, processor_id: processor.id, period_start: periodStart, period_end: periodEnd, currency: "HKD",
    file_url: path, file_name: file.name, uploaded_by: user?.id ?? null, status: "uploaded",
  }).select("id").single();
  if (error) throw error;
  return (data as any).id as string;
}

/** Read an uploaded import (KPay reader). Nothing is saved. */
export async function parsePayoutImport(importId: string): Promise<PayoutRead> {
  const { data, error } = await supabase.functions.invoke("parse-kpay-settlement", { body: { import_id: importId } });
  if (error) throw new Error(error.message || "Parse failed");
  if ((data as any)?.error) throw new Error((data as any).error);
  const d = data as any;
  return { batches: d.batches || [], unknown_merchants: d.unknown_merchants || [], currency: d.currency || "", monthly_audit: d.monthly_audit || [], audit: d.audit || null };
}

/** Save read payouts for one import, skipping any payout already saved. */
export async function savePayoutBatches({ tenantId, processor, importId, batches, merchants, currency }: {
  tenantId: string; processor: PaymentProcessor; importId: string; batches: PayoutBatch[]; merchants: ProcessorMerchant[]; currency: string;
}): Promise<{ saved: number; skipped: number }> {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("The report's currency couldn't be read.");
  const byNumber = new Map(merchants.map(m => [m.merchant_number, m]));
  const unknown = batches.find(b => !byNumber.has(b.merchant_number));
  if (unknown) throw new Error(`Unmapped merchant ${unknown.merchant_number}`);
  const currencySave = await supabase.from("payment_settlement_imports" as any).update({ currency }).eq("tenant_id", tenantId).eq("id", importId);
  if (currencySave.error) throw currencySave.error;
  // Never save the same statement or payout twice: a second save would double the card money.
  const already = await supabase.from("payment_settlement_batches" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("import_id", importId);
  if (already.error) throw already.error;
  if ((already.count ?? 0) > 0) throw new Error("This statement is already saved. Delete it first to save it again.");
  const existing = await supabase.from("payment_settlement_batches" as any)
    .select("merchant_id,settlement_date,transaction_date,gross_amount,net_settlement")
    .eq("tenant_id", tenantId).eq("processor_id", processor.id)
    .in("settlement_date", [...new Set(batches.map(b => b.settlement_date))]);
  if (existing.error) throw existing.error;
  const payoutKey = (m: string, s: string, t: string, g: number, n: number) => `${m}|${s}|${t}|${Number(g).toFixed(2)}|${Number(n).toFixed(2)}`;
  const saved = new Set(((existing.data ?? []) as any[]).map(x => payoutKey(x.merchant_id, x.settlement_date, x.transaction_date, x.gross_amount, x.net_settlement)));
  let skipped = 0, count = 0;
  for (const b of batches) {
    const merchant = byNumber.get(b.merchant_number)!;
    const key = payoutKey(merchant.id, b.settlement_date, b.transaction_date, b.gross_amount, b.net_settlement);
    if (saved.has(key)) { skipped++; continue; }
    saved.add(key);
    const { data: inserted, error: be } = await supabase.from("payment_settlement_batches" as any).insert({
      tenant_id: tenantId, currency, import_id: importId, processor_id: processor.id, merchant_id: merchant.id,
      transaction_date: b.transaction_date, settlement_date: b.settlement_date, gross_amount: b.gross_amount, fee_amount: b.fee_amount,
      points_offset: b.points_offset, bank_transfer_fee: b.bank_transfer_fee, adjustments: b.adjustments, frozen_amount: b.frozen_amount,
      net_settlement: b.net_settlement, bank_account_id: merchant.default_bank_account_id ?? null, status: "unmatched",
      transactions_flagged: b.transactions_flagged, fee_variance: b.fee_variance, audit_status: b.audit_status, notes: b.audit_note || "",
    }).select("id").single();
    if (be) throw be;
    const batchId = (inserted as any).id;
    if (b.lines.length > 0) {
      const { error: le } = await supabase.from("payment_settlement_lines" as any).insert(b.lines.map(l => ({
        batch_id: batchId, payment_type: l.payment_type, payment_type_label: l.payment_type_label, count: l.count, gross_amount: l.gross_amount,
        fee_amount: l.fee_amount, net_amount: l.net_amount, expected_fee: l.expected_fee, fee_variance: l.fee_variance, audit_status: l.audit_status,
      })));
      if (le) throw le;
    }
    for (let i = 0; i < (b.transactions?.length ?? 0); i += 500) {
      const { error: te } = await supabase.from("payment_settlement_transactions" as any).insert(b.transactions.slice(i, i + 500).map(t => ({
        batch_id: batchId, transaction_time: t.transaction_time, payment_method_raw: t.payment_method_raw, payment_method_key: t.payment_method_key,
        locality: t.locality, wallet_type: t.wallet_type ?? null, merchant_number: t.merchant_number, gross_amount: t.gross_amount, fee_amount: t.fee_amount,
        net_amount: t.net_amount, expected_fee: t.expected_fee, fee_variance: t.fee_variance, audit_status: t.audit_status, reference: t.reference || "",
      })));
      if (te) throw te;
    }
    count++;
  }
  await supabase.from("payment_settlement_imports" as any).update({ status: "parsed" }).eq("id", importId).eq("tenant_id", tenantId);
  return { saved: count, skipped };
}

/** Fees charged above the agreed rate, summed over the read payouts (positive = overcharged). */
export const payoutFeeOver = (batches: PayoutBatch[]) => Math.round(batches.reduce((n, b) => n + b.lines.reduce((s, l) => s + (Math.abs(Number(l.fee_variance || 0)) > 0.01 ? Number(l.fee_variance || 0) : 0), 0), 0) * 100) / 100;
