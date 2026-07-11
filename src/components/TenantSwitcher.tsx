import { useEffect, useState } from "react";
import { Check, Building2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useTenantPreview } from "@/contexts/TenantPreviewContext";
import { cn } from "@/lib/utils";

type TenantRow = { id: string; name: string };

/**
 * Compact tenant switcher rendered inside the UserMenu dropdown.
 * Hidden when the user has access to a single tenant and is not a super_admin.
 * Super-admins see every tenant; regular members see only their memberships.
 */
export const TenantSwitcher = () => {
  const { tenantId, setTenantId, memberships, isSuperAdmin, loading } = useActiveTenant();
  const [allTenants, setAllTenants] = useState<TenantRow[]>([]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("tenants").select("id, name").order("name");
      if (!cancelled) setAllTenants((data ?? []) as TenantRow[]);
    })();
    return () => { cancelled = true; };
  }, [isSuperAdmin]);

  if (loading) return null;

  const options: TenantRow[] = isSuperAdmin
    ? allTenants
    : memberships.map((m) => ({ id: m.tenant_id, name: m.tenant_name ?? m.tenant_id.slice(0, 8) }));

  if (options.length <= 1 && !isSuperAdmin) return null;
  if (options.length === 0) return null;

  const onPick = (id: string) => {
    if (id === tenantId) return;
    setTenantId(id);
    // Force a clean reload so every hook / cache re-fetches under the new tenant.
    if (typeof window !== "undefined") window.location.reload();
  };

  return (
    <div className="px-1 pb-1 space-y-0.5">
      {options.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onPick(t.id)}
          className={cn(
            "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            t.id === tenantId && "text-primary"
          )}
        >
          <span className="inline-flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{t.name}</span>
          </span>
          {t.id === tenantId && <Check className="h-3.5 w-3.5 shrink-0" />}
        </button>
      ))}
    </div>
  );
};
