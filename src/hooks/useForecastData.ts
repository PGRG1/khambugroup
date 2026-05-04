import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ForecastRecord, ForecastStatus } from "@/types/forecast";
import { logAuditEvent } from "@/utils/auditLog";
import { calculateForecast } from "@/utils/forecastUtils";

function fromDb(r: any): ForecastRecord {
  return {
    id: r.id,
    date: r.date,
    day: r.day,
    venue: r.venue,
    forecastedCustomers: Number(r.forecasted_customers),
    forecastedAvgSpend: Number(r.forecasted_avg_spend),
    forecastedGrossSales: Number(r.forecasted_gross_sales),
    forecastedServiceCharge: Number(r.forecasted_service_charge),
    forecastedTotalSales: Number(r.forecasted_total_sales),
    comment: r.comment || "",
    forecastNotes: r.forecast_notes || "",
    postEventNotes: r.post_event_notes || "",
    pendingPostEventNotes: r.pending_post_event_notes || null,
    status: r.status as ForecastStatus,
    submittedBy: r.submitted_by,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    createdAt: r.created_at,
    revenueSourceId: r.revenue_source_id ?? null,
    eventId: r.event_id ?? null,
    externalLocation: r.external_location ?? null,
    servicePeriod: r.service_period ?? null,
    salesChannel: r.sales_channel ?? null,
  };
}

function toDb(r: Partial<ForecastRecord>) {
  const dbRecord: Record<string, any> = {};
  if (r.venue !== undefined) dbRecord.venue = r.venue;
  if (r.date !== undefined) dbRecord.date = r.date;
  if (r.day !== undefined) dbRecord.day = r.day;
  if (r.forecastedCustomers !== undefined) dbRecord.forecasted_customers = r.forecastedCustomers;
  if (r.forecastedAvgSpend !== undefined) dbRecord.forecasted_avg_spend = r.forecastedAvgSpend;
  if (r.forecastedGrossSales !== undefined) dbRecord.forecasted_gross_sales = r.forecastedGrossSales;
  if (r.forecastedServiceCharge !== undefined) dbRecord.forecasted_service_charge = r.forecastedServiceCharge;
  if (r.forecastedTotalSales !== undefined) dbRecord.forecasted_total_sales = r.forecastedTotalSales;
  if (r.comment !== undefined) dbRecord.comment = r.comment;
  if (r.forecastNotes !== undefined) dbRecord.forecast_notes = r.forecastNotes;
  if (r.postEventNotes !== undefined) dbRecord.post_event_notes = r.postEventNotes;
  if (r.pendingPostEventNotes !== undefined) dbRecord.pending_post_event_notes = r.pendingPostEventNotes;
  if (r.status !== undefined) dbRecord.status = r.status;
  if (r.submittedBy !== undefined) dbRecord.submitted_by = r.submittedBy;
  if (r.approvedBy !== undefined) dbRecord.approved_by = r.approvedBy;
  if (r.approvedAt !== undefined) dbRecord.approved_at = r.approvedAt;
  if (r.revenueSourceId !== undefined) dbRecord.revenue_source_id = r.revenueSourceId;
  if (r.eventId !== undefined) dbRecord.event_id = r.eventId;
  if (r.externalLocation !== undefined) dbRecord.external_location = r.externalLocation;
  if (r.servicePeriod !== undefined) dbRecord.service_period = r.servicePeriod;
  if (r.salesChannel !== undefined) dbRecord.sales_channel = r.salesChannel;
  return dbRecord;
}

export function useForecastData() {
  const [forecasts, setForecasts] = useState<ForecastRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchForecasts = useCallback(async () => {
    const { data, error } = await supabase
      .from("forecasts")
      .select("*")
      .order("date", { ascending: false });

    if (!error && data) {
      setForecasts(data.map(fromDb));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchForecasts();
  }, [fetchForecasts]);

  const addForecast = useCallback(async (record: Omit<ForecastRecord, "id" | "createdAt" | "approvedBy" | "approvedAt">) => {
    const { error } = await supabase.from("forecasts").insert({
      venue: record.venue,
      date: record.date,
      day: record.day,
      forecasted_customers: record.forecastedCustomers,
      forecasted_avg_spend: record.forecastedAvgSpend,
      forecasted_gross_sales: record.forecastedGrossSales,
      forecasted_service_charge: record.forecastedServiceCharge,
      forecasted_total_sales: record.forecastedTotalSales,
      comment: record.comment,
      forecast_notes: record.forecastNotes,
      post_event_notes: record.postEventNotes,
      status: record.status,
      submitted_by: record.submittedBy,
    });

    if (!error) {
      await logAuditEvent({
        action: "insert",
        entityType: "forecast",
        entityId: `${record.date}-${record.venue}`,
      });
      await fetchForecasts();
    }
    return !error;
  }, [fetchForecasts]);

  const updateForecast = useCallback(async (id: string, updates: Partial<ForecastRecord>) => {
    // If updating figures, recalculate derived fields
    if (updates.forecastedCustomers !== undefined || updates.forecastedAvgSpend !== undefined) {
      const existing = forecasts.find((f) => f.id === id);
      if (existing) {
        const customers = updates.forecastedCustomers ?? existing.forecastedCustomers;
        const avgSpend = updates.forecastedAvgSpend ?? existing.forecastedAvgSpend;
        const calc = calculateForecast(customers, avgSpend);
        updates.forecastedGrossSales = calc.grossSales;
        updates.forecastedServiceCharge = calc.serviceCharge;
        updates.forecastedTotalSales = calc.totalSales;
      }
    }

    const { error } = await supabase
      .from("forecasts")
      .update(toDb(updates))
      .eq("id", id);

    if (!error) {
      const existing = forecasts.find((f) => f.id === id);
      await logAuditEvent({
        action: "update",
        entityType: "forecast",
        entityId: existing ? `${existing.date}-${existing.venue}` : id,
      });
      await fetchForecasts();
    }
    return !error;
  }, [fetchForecasts, forecasts]);

  const deleteForecast = useCallback(async (id: string) => {
    const record = forecasts.find((f) => f.id === id);
    const { error } = await supabase.from("forecasts").delete().eq("id", id);

    if (!error) {
      if (record) {
        await logAuditEvent({
          action: "delete",
          entityType: "forecast",
          entityId: `${record.date}-${record.venue}`,
        });
      }
      await fetchForecasts();
    }
    return !error;
  }, [fetchForecasts, forecasts]);

  const approveForecast = useCallback(async (id: string, userId: string) => {
    return updateForecast(id, {
      status: "approved",
      approvedBy: userId,
      approvedAt: new Date().toISOString(),
    });
  }, [updateForecast]);

  const rejectForecast = useCallback(async (id: string) => {
    return updateForecast(id, {
      status: "draft",
      approvedBy: null,
      approvedAt: null,
    });
  }, [updateForecast]);

  const approvePostEventNotes = useCallback(async (id: string) => {
    const forecast = forecasts.find((f) => f.id === id);
    if (!forecast?.pendingPostEventNotes) return false;
    return updateForecast(id, {
      postEventNotes: forecast.pendingPostEventNotes,
      pendingPostEventNotes: null,
    });
  }, [updateForecast, forecasts]);

  const rejectPostEventNotes = useCallback(async (id: string) => {
    return updateForecast(id, {
      pendingPostEventNotes: null,
    });
  }, [updateForecast]);

  return {
    forecasts,
    loading,
    addForecast,
    updateForecast,
    deleteForecast,
    approveForecast,
    rejectForecast,
    approvePostEventNotes,
    rejectPostEventNotes,
    refetch: fetchForecasts,
  };
}
