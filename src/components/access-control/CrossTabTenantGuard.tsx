import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Detects when ANOTHER tab has switched the active tenant via the shared
 * `khambu.activeTenantId` localStorage key. When that happens while this tab
 * is rendering tenant-scoped pages, we block the UI with an overlay to
 * prevent silently mixing data from two different clients.
 *
 * Storage events only fire in OTHER tabs, so the tab that made the change
 * never sees the overlay.
 */
export function CrossTabTenantGuard() {
  const [changed, setChanged] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "khambu.activeTenantId") return;
      if (e.oldValue === e.newValue) return;
      if (!e.newValue) return;
      setChanged(true);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!changed) return null;

  // Auth pages don't render tenant data — silently accept the change there.
  if (location.pathname.startsWith("/auth")) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-background/95 backdrop-blur flex items-center justify-center p-6">
      <div className="max-w-md w-full card-glass rounded-xl border border-warning/60 p-6 space-y-4">
        <div className="flex items-center gap-2 text-warning">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Client context changed in another tab</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Another browser tab switched into a different client. To avoid
          showing data from two clients side-by-side, this tab is paused.
          Reload to continue in the new client, or return to the Platform.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => {
            try {
              localStorage.removeItem("khambu.enteredTenantId");
              localStorage.removeItem("khambu.activeTenantId");
            } catch {}
            window.location.assign("/platform/clients");
          }}>
            Return to Platform
          </Button>
          <Button onClick={() => window.location.reload()}>Reload this tab</Button>
        </div>
      </div>
    </div>
  );
}
