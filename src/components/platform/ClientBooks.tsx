import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Control plane: a client's books start and opening balances, set by Bani once when the client goes live.
// Editing happens inside the client (Settings › Books setup, shown to Bani only).
export function ClientBooks({ tenantId, onEdit }: { tenantId: string; onEdit: () => void }) {
  const [start, setStart] = useState<string | null | undefined>();
  const [opening, setOpening] = useState<number | undefined>();
  useEffect(() => {
    let on = true;
    void Promise.all([
      supabase.from("app_config").select("value").eq("tenant_id", tenantId).eq("key", "books_start_date").maybeSingle(),
      (supabase.from("supplier_opening_balances" as any) as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      (supabase.from("credit_notes") as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_opening_balance", true).neq("status", "void"),
      (supabase.from("deposit_opening_balances" as any) as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ]).then(([s, a, b, c]) => { if (!on) return; setStart(((s.data as any)?.value as string) ?? null); setOpening((a.count ?? 0) + (b.count ?? 0) + (c.count ?? 0)); });
    return () => { on = false; };
  }, [tenantId]);
  const row = "flex h-11 items-center justify-between gap-3 px-4 sm:px-5 text-[13px] border-t border-[#ECEFED]";
  const day = start ? new Date(`${String(start).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;
  return <section className="card-glass rounded-xl overflow-hidden">
    <div className="flex items-center justify-between px-4 sm:px-5 py-3.5"><h2 className="text-sm font-semibold">Books</h2>
      <button type="button" className="text-[13px] font-medium text-[#1F6B5E]" onClick={onEdit}>Edit</button></div>
    <div className={row}><span className="text-muted-foreground whitespace-nowrap">Books start</span><span className={day ? "" : "text-[#B45309]"}>{start === undefined ? "…" : day ?? "Not set"}</span></div>
    <div className={row}><span className="text-muted-foreground whitespace-nowrap">Opening balances</span><span className={opening ? "" : "text-[#B45309]"}>{opening === undefined ? "…" : opening ? `${opening} ${opening === 1 ? "entry" : "entries"}` : "None yet"}</span></div>
  </section>;
}
