import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

const ACTIVE_KEY = "khambu.activeTenantId";
const ORIGINAL_KEY = "khambu.previewOriginalTenantId";
const PREVIEW_NAME_KEY = "khambu.previewTenantName";
const PREVIEW_ID_KEY = "khambu.previewTenantId";
const TENANT_CHANGE_EVENT = "khambu.activeTenantId.changed";
const PREVIEW_CHANGE_EVENT = "khambu.tenantPreview.changed";

type Ctx = {
  isPreviewing: boolean;
  previewTenantId: string | null;
  previewTenantName: string | null;
  enter: (tenantId: string, tenantName: string) => void;
  exit: () => void;
};

const TenantPreviewContext = createContext<Ctx>({
  isPreviewing: false,
  previewTenantId: null,
  previewTenantName: null,
  enter: () => {},
  exit: () => {},
});

export const useTenantPreview = () => useContext(TenantPreviewContext);

export function TenantPreviewProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [previewTenantId, setId] = useState<string | null>(
    typeof window !== "undefined" ? sessionStorage.getItem(PREVIEW_ID_KEY) : null,
  );
  const [previewTenantName, setName] = useState<string | null>(
    typeof window !== "undefined" ? sessionStorage.getItem(PREVIEW_NAME_KEY) : null,
  );

  useEffect(() => {
    const sync = () => {
      setId(sessionStorage.getItem(PREVIEW_ID_KEY));
      setName(sessionStorage.getItem(PREVIEW_NAME_KEY));
    };
    window.addEventListener(PREVIEW_CHANGE_EVENT, sync);
    return () => window.removeEventListener(PREVIEW_CHANGE_EVENT, sync);
  }, []);

  const enter = useCallback((tenantId: string, tenantName: string) => {
    if (typeof window === "undefined") return;
    const currentActive = localStorage.getItem(ACTIVE_KEY);
    // Only capture "original" the first time — don't overwrite when navigating
    // between clients inside the cockpit.
    if (!sessionStorage.getItem(ORIGINAL_KEY) && currentActive) {
      sessionStorage.setItem(ORIGINAL_KEY, currentActive);
    }
    if (currentActive === tenantId) {
      // Already on this tenant, just record preview state.
    } else {
      localStorage.setItem(ACTIVE_KEY, tenantId);
      window.dispatchEvent(new Event(TENANT_CHANGE_EVENT));
      try { queryClient.clear(); } catch { /* no-op */ }
    }
    sessionStorage.setItem(PREVIEW_ID_KEY, tenantId);
    sessionStorage.setItem(PREVIEW_NAME_KEY, tenantName);
    setId(tenantId);
    setName(tenantName);
    window.dispatchEvent(new Event(PREVIEW_CHANGE_EVENT));
  }, [queryClient]);

  const exit = useCallback(() => {
    if (typeof window === "undefined") return;
    const original = sessionStorage.getItem(ORIGINAL_KEY);
    sessionStorage.removeItem(ORIGINAL_KEY);
    sessionStorage.removeItem(PREVIEW_ID_KEY);
    sessionStorage.removeItem(PREVIEW_NAME_KEY);
    if (original) {
      localStorage.setItem(ACTIVE_KEY, original);
      window.dispatchEvent(new Event(TENANT_CHANGE_EVENT));
      try { queryClient.clear(); } catch { /* no-op */ }
    }
    setId(null);
    setName(null);
    window.dispatchEvent(new Event(PREVIEW_CHANGE_EVENT));
  }, [queryClient]);

  return (
    <TenantPreviewContext.Provider
      value={{
        isPreviewing: !!previewTenantId,
        previewTenantId,
        previewTenantName,
        enter,
        exit,
      }}
    >
      {children}
    </TenantPreviewContext.Provider>
  );
}
