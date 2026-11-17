import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useVenueScope } from "@/hooks/useVenueScope";
import { usePurchasingNavigationAccess } from "@/hooks/usePurchasingNavigationAccess";
import { NewCountDialog } from "@/pages/procurement/StockCounts";
import { Button } from "@/components/ui/button";

/**
 * The one "Count stock" button for Stock & menu. Shown only to people allowed to count.
 * With one venue picked and a count already in progress there, it reopens that count
 * instead of starting a duplicate.
 */
export function CountStockButton() {
  const navigate = useNavigate();
  const { tenantId } = useActiveTenant();
  const scope = useVenueScope();
  const access = usePurchasingNavigationAccess();
  const canCount = access.canOpen({ title: "Counts", url: "/procurement/stock-counts", adminOnly: true });
  const venue = scope.selectedNames.length === 1 ? scope.selectedNames[0] : "";
  const [open, setOpen] = useState(false);
  const inProgress = useQuery({
    queryKey: ["stock-count-in-progress", tenantId, venue],
    enabled: !!tenantId && !!venue && canCount,
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_count_sessions").select("id")
        .eq("tenant_id", tenantId!).eq("venue", venue).eq("status", "in_progress")
        .order("count_date", { ascending: false }).limit(1);
      if (error) throw error;
      return data?.[0]?.id as string | undefined;
    },
  });
  if (!canCount) return null;
  const sessionId = inProgress.data;
  return <>
    <Button size="sm" className="h-10 shrink-0" onClick={() => sessionId ? navigate(`/procurement/stock-counts?session=${sessionId}`) : setOpen(true)}>
      {sessionId ? "Continue count" : "Count stock"}
    </Button>
    {open && <NewCountDialog initialVenue={venue} onClose={() => setOpen(false)} onCreated={id => { setOpen(false); navigate(`/procurement/stock-counts?session=${id}`); }} />}
  </>;
}

/** Stock sub-page tabs, placed the same way as the Invoices family. */
export function StockTabsRow() {
  return <div data-invoice-tabs-host />;
}
