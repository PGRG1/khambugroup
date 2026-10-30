import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { SalesRecord } from "@/types/sales";
import { logAuditEvent } from "@/utils/auditLog";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { captureSavedSalesScan } from "@/utils/salesScanEvidence";
import type { SalesSaveResult } from "@/utils/salesSaveResult";

function toDbRecord(r: SalesRecord, tenantId?: string | null) {
  return {
    ...(tenantId ? { tenant_id: tenantId } : {}),
    date: r.date,
    day: r.day,
    venue: r.venue,
    report_number: r.reportNumber,
    orders: r.orders,
    guests: r.guests,
    subtotal: r.subtotal,
    service_charge: r.serviceCharge,
    discount: -Math.abs(r.discount), // always store as negative
    total_sales: r.totalSales,
    visa: r.visa,
    mastercard: r.mastercard,
    amex: r.amex,
    union_pay: r.unionPay,
    jcb: r.jcb,
    alipay: r.alipay,
    wechat: r.wechat,
    payme: r.payme,
    cash: r.cash,
    deliveroo: r.deliveroo ?? 0,
    foodpanda: r.foodpanda ?? 0,
    keeta: r.keeta ?? 0,
    card_tips: -Math.abs(r.cardTips), // always store as negative (mirrors discount)
    receipt_file_url: r.receiptFileUrl ?? null,
    receipt_file_name: r.receiptFileName ?? null,
    service_period_id: r.servicePeriodId ?? null,
  };
}

function normalizeDiscount(val: number): number {
  // Discount always stored/displayed as negative (it reduces sales)
  return val > 0 ? -val : val;
}

function normalizeCardTips(val: number): number {
  // Card tips always stored/displayed as negative (mirrors discount: deducted from card receipts)
  return val > 0 ? -val : val;
}

function fromDbRecord(r: any): SalesRecord {
  return {
    id: r.id,
    date: r.date,
    day: r.day,
    venue: r.venue,
    reportNumber: r.report_number,
    orders: Number(r.orders),
    guests: Number(r.guests),
    subtotal: Number(r.subtotal),
    serviceCharge: Number(r.service_charge),
    discount: normalizeDiscount(Number(r.discount)),
    totalSales: Number(r.total_sales),
    visa: Number(r.visa),
    mastercard: Number(r.mastercard),
    amex: Number(r.amex),
    unionPay: Number(r.union_pay),
    jcb: Number(r.jcb),
    alipay: Number(r.alipay),
    wechat: Number(r.wechat),
    payme: Number(r.payme),
    cash: Number(r.cash),
    deliveroo: Number(r.deliveroo ?? 0),
    foodpanda: Number(r.foodpanda ?? 0),
    keeta: Number(r.keeta ?? 0),
    cardTips: normalizeCardTips(Number(r.card_tips)),
    receiptFileUrl: r.receipt_file_url ?? null,
    receiptFileName: r.receipt_file_name ?? null,
    servicePeriodId: r.service_period_id ?? null,
  };
}

export function useSalesData() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [data, setData] = useState<SalesRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (tenantLoading) return;
    if (!tenantId) {
      setData([]);
      setLoading(false);
      return;
    }

    const rows = await fetchAllRows(
      "sales_records",
      "*",
      { col: "date", asc: true },
      tenantId,
    );
    setData(rows.map(fromDbRecord));
    setLoading(false);
  }, [tenantId, tenantLoading]);

  useEffect(() => {
    if (!tenantLoading) setLoading(true);
    fetchData();
  }, [fetchData]);

  // Keep the table live: refetch when sales rows change anywhere (scanner, Bani, other tabs) or the tab regains focus.
  useEffect(() => {
    if (!tenantId) return;
    let timer: number | undefined;
    const soon = () => { window.clearTimeout(timer); timer = window.setTimeout(() => { void fetchData(); }, 400); };
    const channel = supabase
      .channel(`sales-records-${tenantId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_records", filter: `tenant_id=eq.${tenantId}` }, soon)
      .subscribe();
    const onVisible = () => { if (document.visibilityState === "visible") soon(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("sales-records-changed", soon);
    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("sales-records-changed", soon);
    };
  }, [tenantId, fetchData]);

  const rebuildJournalSilently = useCallback(async () => {
    if (!tenantId) return;
    try {
      await (supabase as any).rpc("rebuild_journal_from_operations", { p_tenant_id: tenantId });
    } catch (e) {
      console.warn("Journal rebuild failed", e);
    }
  }, [tenantId]);

  const uploadRecords = useCallback(async (records: SalesRecord[]) => {
    if (!tenantId) return false;
    const dbRecords = records.map((record) => toDbRecord(record, tenantId));
    const { error } = await supabase
      .from("sales_records")
      .upsert(dbRecords, { onConflict: "date,venue,report_number" });

    if (!error) {
      await logAuditEvent({
        action: "bulk_upload",
        entityType: "sales_record",
        details: { count: records.length },
      });
      await fetchData();
      rebuildJournalSilently();
    }
    return !error;
  }, [fetchData, rebuildJournalSilently, tenantId]);

  const addRecord = useCallback(async (record: SalesRecord, file?: File | null): Promise<SalesSaveResult> => {
    if (!tenantId) return { status: "failed", error: "No company selected" };
    let finalRecord = record;

    if (file) {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const safeReport = (record.reportNumber || "norpt").replace(/[^a-zA-Z0-9_-]/g, "_");
      const path = `${record.date || "undated"}_${record.venue}_${safeReport}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("sales-receipts")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) return { status: "failed", error: "Receipt upload failed; no sales saved" };
      if (!upErr) {
        finalRecord = { ...record, receiptFileUrl: path, receiptFileName: file.name };
      }
    }

    const { data: inserted, error } = await supabase
      .from("sales_records")
      .insert(toDbRecord(finalRecord, tenantId)).select("id").single();

    if (error || !inserted?.id) return { status: "failed", error: error?.code === "23505" ? "Conflicting sales already exist; no additional sales saved" : "Sales could not be saved" };
    let journal: "completed" | "failed" = "failed";
    if (!error) {
      if (inserted?.id) void captureSavedSalesScan(record, inserted.id, tenantId,
        async (body) => { await supabase.functions.invoke("parse-receipt", { body }); });
      await logAuditEvent({
        action: "insert",
        entityType: "sales_record",
        entityId: `${record.date}-${record.venue}-${record.reportNumber}`,
      }).catch(() => undefined);
      await fetchData().catch(() => undefined);
      try {
        const { error: journalError } = await supabase.rpc("rebuild_journal_from_operations", { p_tenant_id: tenantId });
        if (!journalError) journal = "completed";
      } catch { /* A committed sale is never retried because accounting failed. */ }
    }
    return { status: "saved", recordId: inserted.id, journal };
  }, [fetchData, tenantId]);

  const updateRecord = useCallback(async (oldRecord: SalesRecord, newRecord: SalesRecord) => {
    if (!tenantId) return false;
    if (!oldRecord.id) return false;
    const { error } = await supabase
      .from("sales_records")
      .update(toDbRecord(newRecord, tenantId))
      .eq("tenant_id", tenantId)
      .eq("id", oldRecord.id);

    if (!error) {
      await logAuditEvent({
        action: "update",
        entityType: "sales_record",
        entityId: oldRecord.id,
        details: { old: oldRecord, new: newRecord },
      });
      await fetchData();
      rebuildJournalSilently();
    }
    return !error;
  }, [fetchData, rebuildJournalSilently, tenantId]);

  const deleteRecord = useCallback(async (record: SalesRecord) => {
    if (!tenantId) return false;
    if (!record.id) return false;
    const { error } = await supabase
      .from("sales_records")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("id", record.id);

    if (!error) {
      await logAuditEvent({
        action: "delete",
        entityType: "sales_record",
        entityId: record.id,
      });
      await fetchData();
      rebuildJournalSilently();
    }
    return !error;
  }, [fetchData, rebuildJournalSilently, tenantId]);

  const attachReceipt = useCallback(async (record: SalesRecord, file: File) => {
    if (!tenantId) return false;
    if (!record.id) return false;
    // Delete old file if exists
    if (record.receiptFileUrl) {
      await supabase.storage.from("sales-receipts").remove([record.receiptFileUrl]);
    }
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const safeReport = (record.reportNumber || "norpt").replace(/[^a-zA-Z0-9_-]/g, "_");
    const path = `${record.date || "undated"}_${record.venue}_${safeReport}_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("sales-receipts")
      .upload(path, file, { contentType: file.type, upsert: true });
    if (upErr) return false;

    const { error } = await supabase
      .from("sales_records")
      .update({ receipt_file_url: path, receipt_file_name: file.name })
      .eq("tenant_id", tenantId)
      .eq("id", record.id);

    if (!error) {
      await logAuditEvent({
        action: "attach_receipt",
        entityType: "sales_record",
        entityId: record.id,
        details: { fileName: file.name },
      });
      await fetchData();
    }
    return !error;
  }, [fetchData, tenantId]);

  const getRecordById = useCallback(async (id: string): Promise<SalesRecord | null> => {
    if (!tenantId) return null;
    const cached = data.find((r) => r.id === id);
    if (cached) return cached;
    const { data: row, error } = await supabase
      .from("sales_records")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error || !row) return null;
    return fromDbRecord(row);
  }, [data, tenantId]);

  return { data, loading, uploadRecords, addRecord, updateRecord, deleteRecord, attachReceipt, getRecordById, refetch: fetchData };
}
