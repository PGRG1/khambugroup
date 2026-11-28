import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";

/** Books approvers (Bani, business admin, Approve on Finance): Books setup and opening balances. The database checks again. */
export function useCanEditAccountRules(): boolean {
  const { tenantId } = useActiveTenant();
  const [can, setCan] = useState(false);
  useEffect(() => {
    if (!tenantId) { setCan(false); return; }
    let on = true;
    setCan(false);
    void (supabase.rpc as any)("can_edit_account_rules", { t: tenantId }).then(({ data }: { data: unknown }) => { if (on) setCan(data === true); });
    return () => { on = false; };
  }, [tenantId]);
  return can;
}
