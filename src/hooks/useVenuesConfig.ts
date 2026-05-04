import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { VenueConfig } from "@/types/venueConfig";

const fromDb = (r: any): VenueConfig => ({
  name: r.name,
  displayLabel: r.display_label,
  venueType: r.venue_type,
  isActive: r.is_active,
  includeInDashboard: r.include_in_dashboard,
  includeInForecasting: r.include_in_forecasting,
  includeInInventory: r.include_in_inventory,
  includeInPayroll: r.include_in_payroll,
  historicalOnly: r.historical_only,
  sortOrder: r.sort_order,
});

export function useVenuesConfig() {
  const [venues, setVenues] = useState<VenueConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVenues = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("venues_config")
      .select("*")
      .order("sort_order", { ascending: true });
    if (!error && data) setVenues(data.map(fromDb));
    setLoading(false);
  }, []);

  useEffect(() => { fetchVenues(); }, [fetchVenues]);

  const updateVenue = useCallback(async (name: string, updates: Partial<VenueConfig>) => {
    const dbUpdates: Record<string, any> = {};
    if (updates.displayLabel !== undefined) dbUpdates.display_label = updates.displayLabel;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
    if (updates.includeInDashboard !== undefined) dbUpdates.include_in_dashboard = updates.includeInDashboard;
    if (updates.includeInForecasting !== undefined) dbUpdates.include_in_forecasting = updates.includeInForecasting;
    if (updates.includeInInventory !== undefined) dbUpdates.include_in_inventory = updates.includeInInventory;
    if (updates.includeInPayroll !== undefined) dbUpdates.include_in_payroll = updates.includeInPayroll;
    if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;
    const { error } = await (supabase as any).from("venues_config").update(dbUpdates).eq("name", name);
    if (!error) await fetchVenues();
    return !error;
  }, [fetchVenues]);

  // Venues that should appear in NEW sales-entry dropdowns (active + non-legacy)
  const activeEntryVenues = venues.filter((v) => v.isActive && v.venueType !== "legacy");

  return { venues, activeEntryVenues, loading, updateVenue, refetch: fetchVenues };
}
