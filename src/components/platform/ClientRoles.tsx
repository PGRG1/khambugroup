import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { AREA_LABEL, AREA_NOTE, LEVELS, LEVEL_SHORT, MONEY, ROLE_AREAS, ROLE_COLUMNS, moneyLabel, type TenantRole } from "@/utils/roleAccess";

// Control plane: Bani sets what each of a client's roles can do. The client only assigns these roles to people.
const levelTone = ["text-[#9AA39E]", "text-muted-foreground", "text-[#1F6B5E]", "font-semibold text-[#0F4A40]"];

export function ClientRoles({ tenantId }: { tenantId: string }) {
  const [roles, setRoles] = useState<TenantRole[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<TenantRole | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rs }, { data: us }] = await Promise.all([
      supabase.from("tenant_roles").select(ROLE_COLUMNS).eq("tenant_id", tenantId).order("sort_order"),
      supabase.from("tenant_user_access").select("role_key,status").eq("tenant_id", tenantId),
    ]);
    setRoles((rs ?? []) as unknown as TenantRole[]);
    const c: Record<string, number> = {};
    for (const u of us ?? []) if (u.role_key && u.status === "active") c[u.role_key] = (c[u.role_key] ?? 0) + 1;
    setCounts(c); setLoading(false);
  }, [tenantId]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    const body = { name: draft.name, money: draft.money, ...Object.fromEntries(ROLE_AREAS.map((a) => [a, draft[a]])) };
    const { error } = await (supabase.rpc as any)("save_tenant_role", { t: tenantId, k: draft.role_key, r: body });
    setBusy(false);
    if (error) { toast({ title: error.message, variant: "destructive" }); return; }
    toast({ title: `${draft.name} saved` }); setDraft(null); void load();
  };

  if (draft) return <section className="card-glass rounded-xl px-4 sm:px-5 py-4 space-y-5">
    <div className="flex items-center justify-between gap-3">
      <button type="button" className="text-[13px] text-[#1F6B5E]" onClick={() => setDraft(null)}>‹ Roles</button>
      <span className="flex gap-2"><Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button><Button disabled={busy || !draft.name.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save role"}</Button></span>
    </div>
    <label className="grid max-w-[360px] gap-1 text-[12px] text-muted-foreground">Role name
      <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-10 text-[13px] text-foreground" /></label>
    <div>
      <h3 className="text-[14px] font-semibold">What they can do</h3>
      <div className="mt-2 space-y-1.5">{ROLE_AREAS.map((a) => {
        const fixed = draft.role_key === "owner";
        return <div key={a} className="grid grid-cols-[110px_auto] sm:grid-cols-[120px_auto_1fr] items-center gap-x-4 gap-y-1 min-h-11 text-[13px]">
          <span>{AREA_LABEL[a]}</span>
          <span role="radiogroup" aria-label={AREA_LABEL[a]} className="inline-flex gap-0.5 rounded-full bg-[rgba(31,63,59,.06)] p-[3px]">
            {LEVELS.map((l, i) => <button key={l} type="button" role="radio" aria-checked={draft[a] === i} disabled={fixed}
              onClick={() => setDraft({ ...draft, [a]: i })}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-[12.5px] ${draft[a] === i ? "bg-white font-semibold shadow-sm" : "text-muted-foreground"}`}>{l}</button>)}
          </span>
          <span className="hidden sm:block truncate text-[12.5px] text-muted-foreground">{AREA_NOTE[a]}</span>
        </div>;
      })}</div>
      {draft.role_key === "owner" && <p className="mt-2 text-[12.5px] text-muted-foreground">The Owner always keeps full access.</p>}
    </div>
    <div>
      <h3 className="text-[14px] font-semibold">Money figures</h3>
      <div className="mt-1">{MONEY.map((m) => <label key={m.key} className="flex cursor-pointer items-start gap-3 py-1.5">
        <input type="radio" className="mt-0.5 h-4 w-4 accent-[#1F6B5E]" disabled={draft.role_key === "owner"} checked={draft.money === m.key} onChange={() => setDraft({ ...draft, money: m.key })} />
        <span><span className={`block text-[13px] ${draft.money === m.key ? "font-semibold" : ""}`}>{m.label}</span><span className="block text-[12.5px] text-muted-foreground">{m.line}</span></span>
      </label>)}</div>
    </div>
  </section>;

  return <section className="card-glass rounded-xl overflow-hidden">
    <div className="flex items-center justify-between px-4 sm:px-5 py-3.5"><h2 className="text-sm font-semibold">Roles · {roles.length}</h2></div>
    <div className="kit sales-table-scroll" tabIndex={0} role="region" aria-label="Roles table"><table className="sales-table" aria-label="Roles">
      <thead><tr><th scope="col" className="sales-cell-left">Role</th>{ROLE_AREAS.map((a) => <th key={a} scope="col" className="sales-cell-left">{AREA_LABEL[a]}</th>)}<th scope="col" className="sales-cell-left">Money</th><th scope="col" className="sales-cell-right">People</th></tr></thead>
      <tbody>{roles.map((r) => <tr key={r.role_key} className="sales-record-row cursor-pointer" tabIndex={0} onClick={() => setDraft({ ...r })} onKeyDown={(e) => e.key === "Enter" && setDraft({ ...r })}>
        <td className="sales-cell-left font-medium whitespace-nowrap">{r.name}</td>
        {ROLE_AREAS.map((a) => <td key={a} className={`sales-cell-left whitespace-nowrap ${levelTone[r[a]] ?? ""}`}>{LEVEL_SHORT[r[a]] ?? "—"}</td>)}
        <td className="sales-cell-left whitespace-nowrap">{moneyLabel(r.money)}</td>
        <td className="kit-num">{counts[r.role_key] ?? 0}</td>
      </tr>)}</tbody></table></div>
    {!loading && !roles.length && <p className="px-4 sm:px-5 py-3 text-[13px] text-muted-foreground">No roles yet.</p>}
    <p className="px-4 sm:px-5 py-3 text-[12px] text-muted-foreground">See: view only · Do: enter and edit · Approve: sign off and change setup. Tap a role to change it.</p>
  </section>;
}
