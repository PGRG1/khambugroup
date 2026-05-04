import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EventRecord } from "@/types/event";

const fromDb = (r: any): EventRecord => ({
  id: r.id,
  name: r.name,
  eventType: r.event_type,
  linkedVenue: r.linked_venue,
  externalLocation: r.external_location,
  startDate: r.start_date,
  endDate: r.end_date,
  revenueSourceId: r.revenue_source_id,
  servicePeriod: r.service_period,
  salesChannel: r.sales_channel,
  expectedGuests: r.expected_guests,
  forecastAvgSpend: r.forecast_avg_spend == null ? null : Number(r.forecast_avg_spend),
  forecastRevenue: r.forecast_revenue == null ? null : Number(r.forecast_revenue),
  actualGuests: r.actual_guests,
  actualRevenue: r.actual_revenue == null ? null : Number(r.actual_revenue),
  notes: r.notes ?? "",
  status: r.status,
  includeInDashboard: r.include_in_dashboard,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

const toDb = (r: Partial<EventRecord>) => {
  const out: Record<string, any> = {};
  if (r.name !== undefined) out.name = r.name;
  if (r.eventType !== undefined) out.event_type = r.eventType;
  if (r.linkedVenue !== undefined) out.linked_venue = r.linkedVenue || null;
  if (r.externalLocation !== undefined) out.external_location = r.externalLocation || null;
  if (r.startDate !== undefined) out.start_date = r.startDate;
  if (r.endDate !== undefined) out.end_date = r.endDate;
  if (r.revenueSourceId !== undefined) out.revenue_source_id = r.revenueSourceId || null;
  if (r.servicePeriod !== undefined) out.service_period = r.servicePeriod || null;
  if (r.salesChannel !== undefined) out.sales_channel = r.salesChannel || null;
  if (r.expectedGuests !== undefined) out.expected_guests = r.expectedGuests;
  if (r.forecastAvgSpend !== undefined) out.forecast_avg_spend = r.forecastAvgSpend;
  if (r.forecastRevenue !== undefined) out.forecast_revenue = r.forecastRevenue;
  if (r.actualGuests !== undefined) out.actual_guests = r.actualGuests;
  if (r.actualRevenue !== undefined) out.actual_revenue = r.actualRevenue;
  if (r.notes !== undefined) out.notes = r.notes;
  if (r.status !== undefined) out.status = r.status;
  if (r.includeInDashboard !== undefined) out.include_in_dashboard = r.includeInDashboard;
  return out;
};

export function useEvents() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("events")
      .select("*")
      .order("start_date", { ascending: false });
    if (!error && data) setEvents(data.map(fromDb));
    setLoading(false);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const addEvent = useCallback(async (record: Partial<EventRecord>) => {
    const { data: userData } = await supabase.auth.getUser();
    const payload = { ...toDb(record), created_by: userData.user?.id ?? null };
    const { error } = await (supabase as any).from("events").insert(payload);
    if (!error) await fetchEvents();
    return !error;
  }, [fetchEvents]);

  const updateEvent = useCallback(async (id: string, updates: Partial<EventRecord>) => {
    const { error } = await (supabase as any).from("events").update(toDb(updates)).eq("id", id);
    if (!error) await fetchEvents();
    return !error;
  }, [fetchEvents]);

  const deleteEvent = useCallback(async (id: string) => {
    const { error } = await (supabase as any).from("events").delete().eq("id", id);
    if (!error) await fetchEvents();
    return !error;
  }, [fetchEvents]);

  return { events, loading, addEvent, updateEvent, deleteEvent, refetch: fetchEvents };
}
