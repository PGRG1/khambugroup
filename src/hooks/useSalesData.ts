import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SalesRecord } from "@/types/sales";
import { logAuditEvent } from "@/utils/auditLog";

function toDbRecord(r: SalesRecord) {
  return {
    date: r.date,
    day: r.day,
    venue: r.venue,
    report_number: r.reportNumber,
    orders: r.orders,
    guests: r.guests,
    subtotal: r.subtotal,
    service_charge: r.serviceCharge,
    discount: r.discount,
    total_sales: r.totalSales,
    visa: r.visa,
    mastercard: r.mastercard,
    amex: r.amex,
    union_pay: r.unionPay,
    alipay: r.alipay,
    wechat: r.wechat,
    cash: r.cash,
    card_tips: r.cardTips,
  };
}

function fromDbRecord(r: any): SalesRecord {
  return {
    date: r.date,
    day: r.day,
    venue: r.venue,
    reportNumber: r.report_number,
    orders: Number(r.orders),
    guests: Number(r.guests),
    subtotal: Number(r.subtotal),
    serviceCharge: Number(r.service_charge),
    discount: Number(r.discount),
    totalSales: Number(r.total_sales),
    visa: Number(r.visa),
    mastercard: Number(r.mastercard),
    amex: Number(r.amex),
    unionPay: Number(r.union_pay),
    alipay: Number(r.alipay),
    wechat: Number(r.wechat),
    cash: Number(r.cash),
    cardTips: Number(r.card_tips),
  };
}

export function useSalesData() {
  const [data, setData] = useState<SalesRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data: rows, error } = await supabase
      .from("sales_records")
      .select("*")
      .order("date", { ascending: true });

    if (!error && rows) {
      setData(rows.map(fromDbRecord));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const uploadRecords = useCallback(async (records: SalesRecord[]) => {
    const dbRecords = records.map(toDbRecord);
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
    }
    return !error;
  }, [fetchData]);

  const addRecord = useCallback(async (record: SalesRecord) => {
    const { error } = await supabase
      .from("sales_records")
      .insert(toDbRecord(record));

    if (!error) {
      await logAuditEvent({
        action: "insert",
        entityType: "sales_record",
        entityId: `${record.date}-${record.venue}-${record.reportNumber}`,
      });
      await fetchData();
    }
    return !error;
  }, [fetchData]);

  const updateRecord = useCallback(async (oldRecord: SalesRecord, newRecord: SalesRecord) => {
    const { error } = await supabase
      .from("sales_records")
      .update(toDbRecord(newRecord))
      .eq("date", oldRecord.date)
      .eq("venue", oldRecord.venue)
      .eq("report_number", oldRecord.reportNumber);

    if (!error) {
      await logAuditEvent({
        action: "update",
        entityType: "sales_record",
        entityId: `${oldRecord.date}-${oldRecord.venue}-${oldRecord.reportNumber}`,
        details: { old: oldRecord, new: newRecord },
      });
      await fetchData();
    }
    return !error;
  }, [fetchData]);

  const deleteRecord = useCallback(async (record: SalesRecord) => {
    const { error } = await supabase
      .from("sales_records")
      .delete()
      .eq("date", record.date)
      .eq("venue", record.venue)
      .eq("report_number", record.reportNumber);

    if (!error) {
      await logAuditEvent({
        action: "delete",
        entityType: "sales_record",
        entityId: `${record.date}-${record.venue}-${record.reportNumber}`,
      });
      await fetchData();
    }
    return !error;
  }, [fetchData]);

  return { data, loading, uploadRecords, addRecord, updateRecord, deleteRecord, refetch: fetchData };
}
