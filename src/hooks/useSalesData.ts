import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { SalesRecord } from "@/types/sales";
import { logAuditEvent } from "@/utils/auditLog";
import { useActiveTenant } from "@/hooks/useActiveTenant";

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
    card_tips: -Math.abs(r.cardTips), // always store as negative (mirrors discount)
    receipt_file_url: r.receiptFileUrl ?? null,
    receipt_file_name: r.receiptFileName ?? null,
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
    cardTips: normalizeCardTips(Number(r.card_tips)),
    receiptFileUrl: r.receipt_file_url ?? null,
    receiptFileName: r.receipt_file_name ?? null,
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

    const rows = (await fetchAllRows("sales_records", "*", { col: "date", asc: true }))
      .filter((row) => row.tenant_id === tenantId);
    setData(rows.map(fromDbRecord));
    setLoading(false);
  }, [tenantId, tenantLoading]);

  useEffect(() => {
    if (!tenantLoading) setLoading(true);
    fetchData();
  }, [fetchData]);

  const rebuildJournalSilently = useCallback(async () => {
    try {
      await (supabase as any).rpc("rebuild_journal_from_operations");
    } catch (e) {
      console.warn("Journal rebuild failed", e);
    }
  }, []);

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

  const addRecord = useCallback(async (record: SalesRecord, file?: File | null) => {
    if (!tenantId) return false;
    let finalRecord = record;

    if (file) {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const safeReport = (record.reportNumber || "norpt").replace(/[^a-zA-Z0-9_-]/g, "_");
      const path = `${record.date || "undated"}_${record.venue}_${safeReport}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("sales-receipts")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (!upErr) {
        finalRecord = { ...record, receiptFileUrl: path, receiptFileName: file.name };
      }
    }

    const { error } = await supabase
      .from("sales_records")
      .insert(toDbRecord(finalRecord, tenantId));

    if (!error) {
      await logAuditEvent({
        action: "insert",
        entityType: "sales_record",
        entityId: `${record.date}-${record.venue}-${record.reportNumber}`,
      });
      await fetchData();
      rebuildJournalSilently();
    }
    return !error;
  }, [fetchData, rebuildJournalSilently, tenantId]);

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
