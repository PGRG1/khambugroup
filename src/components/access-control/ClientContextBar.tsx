import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowLeft, Building2, X, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantSession } from "@/hooks/useTenantSession";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";

/**
 * Compact floating client-context indicator. Shown ONLY when a platform admin
 * is inside a client tenant. Sits as a small pill in the bottom-right so it
 * never blocks header actions. Collapses to an icon-only dot on tap.
 */
export function ClientContextBar() {
  const location = useLocation();
  const { isPlatformAdmin } = usePlatformAdmin();
  const { activeTenantId, isInsideClient, exitToPlatform } = useTenantSession();
  const [name, setName] = useState<string>("");
  const [collapsed, setCollapsed] = useState(false);

  const inPlatform = location.pathname.startsWith("/platform");
  const inAuth = location.pathname.startsWith("/auth");
  const shouldShow = isPlatformAdmin && isInsideClient && !inPlatform && !inAuth;

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

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        aria-label="Show client context"
        className="fixed bottom-4 right-4 z-[100] h-10 w-10 rounded-full bg-warning text-warning-foreground shadow-lg border border-warning-foreground/20 flex items-center justify-center hover:scale-105 transition-transform"
      >
        <Building2 className="h-4 w-4" />
        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-warning-foreground/80 ring-2 ring-background" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100] max-w-[calc(100vw-2rem)] flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full bg-warning text-warning-foreground shadow-lg border border-warning-foreground/20 text-xs">
      <Building2 className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium truncate max-w-[40vw] sm:max-w-none">
        <span className="opacity-75 hidden sm:inline">Inside client:</span> <strong>{name || "…"}</strong>
      </span>
      <button
        onClick={exitToPlatform}
        title="Back to Platform"
        aria-label="Back to Platform"
        className="h-7 px-2 rounded-full bg-warning-foreground/15 hover:bg-warning-foreground/25 flex items-center gap-1 font-medium transition-colors"
      >
        <ArrowLeft className="h-3 w-3" />
        <span className="hidden sm:inline">Exit</span>
      </button>
      <button
        onClick={() => setCollapsed(true)}
        title="Minimize"
        aria-label="Minimize"
        className="h-7 w-7 rounded-full hover:bg-warning-foreground/15 flex items-center justify-center transition-colors"
      >
        <ChevronUp className="h-3.5 w-3.5 rotate-180" />
      </button>
    </div>
  );
}
