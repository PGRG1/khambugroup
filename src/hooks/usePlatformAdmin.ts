import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { sessionQueryTiming } from "@/utils/sessionQuery";

/**
 * Returns true if the signed-in user has the Bani-level `platform_admin`
 * (or legacy `super_admin`) role on ANY tenant_members row.
 */
export function usePlatformAdmin() {
  const { user } = useAuth();
  const { previewUserId } = usePreviewMode();
  // Active tenant is part of the cache identity, not part of platform authority.
  const tenantId = localStorage.getItem("khambu.activeTenantId");
  const query = useQuery({
    queryKey: ["platform-admin", user?.id, tenantId, previewUserId],
    enabled: !!user,
    ...sessionQueryTiming,
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .from("tenant_members")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["platform_admin", "super_admin"]);
      if (error) throw error;
      return !!data?.length;
    },
  });
  return { isPlatformAdmin: query.data ?? false, loading: !!user && query.isPending, refetch: query.refetch };
}
