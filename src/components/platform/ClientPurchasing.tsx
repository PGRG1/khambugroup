import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Control plane: where a client's purchasing setup stands. It is edited inside the client
// (Settings › Purchasing setup), by Bani or a role with Approve on Finance.
export function ClientPurchasing({ tenantId, onEdit }: { tenantId: string; onEdit: () => void }) {
  const [v, setV] = useState<number | null | undefined>();
  const [held, setHeld] = useState<number | undefined>();
  useEffect(() => {
    let on = true;
    const db = supabase as any;
    void Promise.all([
      db.from("purchasing_setup_versions").select("version_no").eq("tenant_id", tenantId).order("version_no", { ascending: false }).limit(1),
      db.from("purchase_posting_holds").select("invoice_id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ]).then(([a, b]) => { if (!on) return; setV((a.data ?? [])[0]?.version_no ?? null); setHeld(b.count ?? 0); });
    return () => { on = false; };
  }, [tenantId]);
  const row = "flex h-11 items-center justify-between gap-3 px-4 sm:px-5 text-[13px] border-t border-[#ECEFED]";
  return <section className="card-glass rounded-xl overflow-hidden">
    <div className="flex items-center justify-between px-4 sm:px-5 py-3.5"><h2 className="text-sm font-semibold">Purchasing setup</h2>
      <button type="button" className="text-[13px] font-medium text-[#1F6B5E]" onClick={onEdit}>Edit</button></div>
    <div className={row}><span className="text-muted-foreground whitespace-nowrap">Current version</span><span>{v === undefined ? "…" : v ? `Version ${v}` : "Not saved yet"}</span></div>
    <div className={row}><span className="text-muted-foreground whitespace-nowrap">Held invoices</span><span className={held ? "text-[#B45309]" : ""}>{held === undefined ? "…" : held || "None"}</span></div>
  </section>;
}
