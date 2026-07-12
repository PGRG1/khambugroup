import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowLeft, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useTenantSession } from "@/hooks/useTenantSession";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";

/**
 * Persistent slim bar shown ONLY when a platform admin is fully inside a
 * client that is not their own home tenant. Replaces the earlier
 * "preview banner" concept — this is now structural, not a preview.
 */
export function ClientContextBar() {
  const location = useLocation();
  const { isPlatformAdmin } = usePlatformAdmin();
  const { activeTenantId, isInsideNonHomeClient, exitToPlatform } = useTenantSession();
  const [name, setName] = useState<string>("");

  const inPlatform = location.pathname.startsWith("/platform");
  const inAuth = location.pathname.startsWith("/auth");
  const shouldShow = isPlatformAdmin && isInsideNonHomeClient && !inPlatform && !inAuth;

  useEffect(() => {
    if (!shouldShow || !activeTenantId) { setName(""); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("tenants").select("name").eq("id", activeTenantId).maybeSingle();
      if (!cancelled) setName(data?.name ?? "Client");
    })();
    return () => { cancelled = true; };
  }, [shouldShow, activeTenantId]);

  if (!shouldShow) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-warning text-warning-foreground px-4 py-2 flex items-center justify-center gap-3 text-sm shadow-lg border-b-2 border-warning-foreground/20">
      <Building2 className="h-4 w-4 shrink-0" />
      <span className="font-medium">
        Inside client: <strong>{name || "…"}</strong> — you are viewing and editing <u>their</u> data.
      </span>
      <Button size="sm" variant="secondary" onClick={exitToPlatform} className="h-7 gap-1 text-xs ml-2">
        <ArrowLeft className="h-3 w-3" /> Back to Platform
      </Button>
    </div>
  );
}
