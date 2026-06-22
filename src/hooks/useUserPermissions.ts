import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PageKey, Authority } from "@/utils/permissions";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export interface MyPermissions {
  status: string;
  pages: Record<string, {
    show_in_sidebar: boolean;
    can_access: boolean;
    authority: Authority;
    hidden_actions: string[];
  }>;
}

export function useUserPermissions(userId: string | undefined) {
  const { tenantId } = useActiveTenant();
  const [permissions, setPermissions] = useState<MyPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    // Scope permission lookups to the active tenant so super-admins switching
    // tenants see the correct access set for each.
    const accessQ = supabase.from("user_access_control").select("status").eq("user_id", userId);
    const pagesQ = supabase.from("user_page_permissions").select("*").eq("user_id", userId);
    const [{ data: access }, { data: pages }] = await Promise.all([
      tenantId ? accessQ.eq("tenant_id", tenantId).maybeSingle() : accessQ.maybeSingle(),
      tenantId ? pagesQ.eq("tenant_id", tenantId) : pagesQ,
    ]);

    const pagesMap: MyPermissions["pages"] = {};
    if (pages) {
      for (const p of pages) {
        pagesMap[p.page_key] = {
          show_in_sidebar: p.show_in_sidebar,
          can_access: p.can_access,
          authority: p.authority as Authority,
          hidden_actions: (p.hidden_actions as string[]) || [],
        };
      }
    }

    setPermissions({
      status: access?.status || "active",
      pages: pagesMap,
    });
    setLoading(false);
  }, [userId, tenantId]);

  useEffect(() => { fetchPermissions(); }, [fetchPermissions]);


  const canAccessPage = useCallback((pageKey: string) => {
    if (!permissions) return true;
    if (permissions.status === "disabled") return false;
    const p = permissions.pages[pageKey];
    return p ? p.can_access : true;
  }, [permissions]);

  const showInSidebar = useCallback((pageKey: string) => {
    if (!permissions) return true;
    if (permissions.status === "disabled") return false;
    const p = permissions.pages[pageKey];
    return p ? p.show_in_sidebar : true;
  }, [permissions]);

  const isActionHidden = useCallback((actionKey: string) => {
    if (!permissions) return false;
    const pageKey = actionKey.split(".")[0];
    const p = permissions.pages[pageKey];
    if (!p) return false;
    return p.hidden_actions.includes(actionKey);
  }, [permissions]);

  const getAuthority = useCallback((pageKey: string): Authority => {
    if (!permissions) return "edit";
    const p = permissions.pages[pageKey];
    return p ? p.authority : "view_only";
  }, [permissions]);

  return {
    permissions,
    loading,
    canAccessPage,
    showInSidebar,
    isActionHidden,
    getAuthority,
    refetch: fetchPermissions,
  };
}
