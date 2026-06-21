import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Returns true if the signed-in user has the Bani-level `platform_admin`
 * (or legacy `super_admin`) role on ANY tenant_members row.
 */
export function usePlatformAdmin() {
  const { user } = useAuth();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setIsPlatformAdmin(false); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("tenant_members")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["platform_admin", "super_admin"]);
      if (!cancelled) {
        setIsPlatformAdmin(!!(data && data.length > 0));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return { isPlatformAdmin, loading };
}
