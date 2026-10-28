import { useQuery } from "@tanstack/react-query";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { supabase } from "@/integrations/supabase/client";
import { resolvePurchasingMode } from "@/utils/purchasingMode";

export function usePurchasingMode() {
  const { tenantId } = useActiveTenant();
  const query = useQuery({
    queryKey: ["purchasing-mode", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      if (!tenantId) return { mode: resolvePurchasingMode(null), tenantName: "" };
      const [config, tenant] = await Promise.all([
        supabase.from("app_config").select("value").eq("tenant_id", tenantId).eq("key", "purchasing_mode").maybeSingle(),
        supabase.from("tenants").select("name").eq("id", tenantId).single(),
      ]);
      if (config.error) throw config.error;
      if (tenant.error) throw tenant.error;
      return { mode: resolvePurchasingMode(config.data?.value), tenantName: tenant.data.name };
    },
  });
  return { ...query, tenantId, mode: query.data?.mode ?? "by_venue", tenantName: query.data?.tenantName ?? "" };
}