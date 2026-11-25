import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";

/** The Items Master is the pre-approved list: only approvers change it (checked again by the database). */
export const ITEM_LIST_APPROVER_ONLY = "Only an approver can change the Items Master.";

export function useCanEditItemList(): boolean | null {
  const { tenantId } = useActiveTenant();
  const [can, setCan] = useState<boolean | null>(null);
  useEffect(() => {
    if (!tenantId) { setCan(null); return; }
    let on = true;
    setCan(null);
    void (supabase.rpc as any)("can_edit_item_list", { t: tenantId }).then(({ data }: { data: unknown }) => { if (on) setCan(data === true); });
    return () => { on = false; };
  }, [tenantId]);
  return can;
}
