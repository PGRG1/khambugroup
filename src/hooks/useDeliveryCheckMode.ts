import { useQuery } from "@tanstack/react-query";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { supabase } from "@/integrations/supabase/client";
import { resolveDeliveryCheckMode, type DeliveryCheckMode } from "@/utils/deliveryCheck";

/** Tenant "How you check deliveries" setting; defaults to Quick when unset. */
export function useDeliveryCheckMode() {
  const { tenantId } = useActiveTenant();
  const query = useQuery({
    queryKey: ["delivery-check-mode", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      if (!tenantId) return { mode: resolveDeliveryCheckMode(null) };
      const { data, error } = await supabase
        .from("app_config")
        .select("value")
        .eq("tenant_id", tenantId)
        .eq("key", "delivery_check_mode")
        .maybeSingle();
      if (error) throw error;
      return { mode: resolveDeliveryCheckMode(data?.value) };
    },
  });
  return { ...query, tenantId, mode: (query.data?.mode ?? "quick") as DeliveryCheckMode };
}
