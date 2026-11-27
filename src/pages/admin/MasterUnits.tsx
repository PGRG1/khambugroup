import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UnitsPage, type UnitsStore } from "@/components/settings/UnitsPage";
import type { UomOption } from "@/hooks/useUomOptions";

// Control plane › Units: Bani's master units list (unit_master), in the same three cards as a client's
// Settings › Master data › Units. Every client starts from it and follows it (save_master_unit syncs all clients).
// Only platform admins can save (checked in the database).
export default function MasterUnits() {
  const [items, setItems] = useState<UomOption[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("unit_master" as any).select("id, code, label, uom_type, sort_order, is_active").order("uom_type").order("sort_order").order("code");
    if (error) toast.error(error.message); else setItems((data as unknown as UomOption[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async (args: { p_id: string | null; p_code: string; p_label: string; p_type: string; p_active: boolean }) => {
    const { error } = await supabase.rpc("save_master_unit" as any, args);
    if (error) { toast.error(error.message); return null; }
    await load(); return true;
  };
  const store: UnitsStore = {
    items, loading,
    createItem: (i) => save({ p_id: null, p_code: i.code, p_label: i.label, p_type: i.uom_type, p_active: true }),
    updateItem: (id, patch) => { const u = items.find(x => x.id === id); return u ? save({ p_id: id, p_code: u.code, p_label: patch.label ?? u.label, p_type: u.uom_type, p_active: patch.is_active ?? u.is_active }) : Promise.resolve(null); },
  };
  return <div className="kit settings-main px-4 py-5 sm:p-6 space-y-3 max-w-[1100px] mx-auto">
    <h1 className="text-[22px] sm:text-2xl font-semibold tracking-tight">Master units</h1>
    <p className="text-[13px] text-muted-foreground">Every client gets these units and follows your changes. Clients can add their own.</p>
    <UnitsPage store={store} master />
  </div>;
}
