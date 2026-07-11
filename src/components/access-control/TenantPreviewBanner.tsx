import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenantPreview } from "@/contexts/TenantPreviewContext";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";

/**
 * Full-width, unmissable banner shown whenever a platform admin has entered
 * an explicit "act on client X" preview state from the onboarding cockpit.
 * While this banner is visible, every tenant-scoped hook resolves to the
 * previewed client's tenant_id — NOT the admin's own tenant.
 */
export function TenantPreviewBanner() {
  const { isPreviewing, previewTenantName, exit } = useTenantPreview();
  const { isPlatformAdmin } = usePlatformAdmin();
  const location = useLocation();
  const navigate = useNavigate();

  // Auto-exit when the admin leaves the client cockpit for the platform home
  // or list, so navigating back to /platform/clients cleanly returns them to
  // their own tenant.
  useEffect(() => {
    if (!isPreviewing) return;
    const p = location.pathname;
    const stillInside =
      p.startsWith("/platform/clients/") ||
      p.startsWith("/admin/clients/") ||
      // deep-links out to any tenant-scoped page keep the preview alive
      !p.startsWith("/platform");
    if (!stillInside) exit();
  }, [location.pathname, isPreviewing, exit]);

  if (!isPreviewing || !isPlatformAdmin) return null;

  const handleExit = () => {
    exit();
    navigate("/platform/clients");
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-warning text-warning-foreground px-4 py-2 flex items-center justify-center gap-3 text-sm shadow-lg border-b-2 border-warning-foreground/20">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="font-medium">
        Previewing client: <strong>{previewTenantName ?? "Unknown"}</strong> — you are viewing and editing <u>their</u> data, not your own.
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={handleExit}
        className="h-7 gap-1 text-xs ml-2"
      >
        <X className="h-3 w-3" /> Exit preview
      </Button>
    </div>
  );
}
