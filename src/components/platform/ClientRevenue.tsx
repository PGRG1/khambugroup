import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Control plane: where a client's revenue mapping stands. It is edited inside the client
// (Settings › Revenue mapping), by Bani or a role with Approve on Finance.
export function ClientRevenue({ tenantId, onEdit }: { tenantId: string; onEdit: () => void }) {
  const [v, setV] = useState<{ version_no: number; effective_from: string } | null | undefined>();
  const [held, setHeld] = useState<number | undefined>();
  const [fixed, setFixed] = useState(false);
  useEffect(() => {
    let on = true;
    const db = supabase as any;
    void Promise.all([
      db.from("sales_mapping_versions").select("version_no,effective_from").eq("tenant_id", tenantId).order("version_no", { ascending: false }).limit(1),
      db.from("sales_posting_holds").select("day", { count: "exact", head: true }).eq("tenant_id", tenantId),
      db.from("sales_report_lines").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true).not("legacy_field", "is", null),
    ]).then(([a, b, c]) => { if (!on) return; setV((a.data ?? [])[0] ?? null); setHeld(b.count ?? 0); setFixed((c.count ?? 0) > 0); });
    return () => { on = false; };
  }, [tenantId]);
  const row = "flex h-11 items-center justify-between gap-3 px-4 sm:px-5 text-[13px] border-t border-[#ECEFED]";
  const day = v ? new Date(`${v.effective_from}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;
  return <section className="card-glass rounded-xl overflow-hidden">
    <div className="flex items-center justify-between px-4 sm:px-5 py-3.5"><h2 className="text-sm font-semibold">Revenue setup</h2>
      {!fixed && <button type="button" className="text-[13px] font-medium text-[#1F6B5E]" onClick={onEdit}>{v ? "Edit" : "Set up"}</button>}</div>
    {fixed ? <div className={row}><span className="text-muted-foreground whitespace-nowrap">Report fields</span><span>Fixed fields</span></div> : <>
      <div className={row}><span className="text-muted-foreground whitespace-nowrap">Current version</span><span className={v === null ? "text-[#B45309]" : ""}>{v === undefined ? "…" : v ? `Version ${v.version_no} · starts ${day}` : "Not set up"}</span></div>
      <div className={row}><span className="text-muted-foreground whitespace-nowrap">Held days</span><span className={held ? "text-[#B45309]" : ""}>{held === undefined ? "…" : held || "None"}</span></div>
    </>}
  </section>;
}
