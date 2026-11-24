import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { GROUPS, groupLabel } from "@/utils/purchasingSetup";
import { pathOf, type CatRow } from "@/utils/categoryTree";

// Control plane › Categories: Bani's master list (category_master). Every client starts from it and follows it
// (save_master_category syncs all clients). Categories clients added themselves are listed with Add to master
// (promote_client_category). Clients keep their own; nothing about their products changes here.

type Master = { id: string; level: 1 | 2 | 3; name: string; parent_id: string | null; default_group: string | null; is_active: boolean };
type Own = CatRow & { tenant_id: string };
type Editing = { id: string | null; level: 1 | 2 | 3; parent: string | null; name: string; group: string; active: boolean };

const cell = "h-11 px-2 whitespace-nowrap border-b border-[#ECEAE3]";
const link = "text-[13px] font-medium text-[#1F6B5E]";

export default function MasterCategories() {
  const [master, setMaster] = useState<Master[]>([]);
  const [own, setOwn] = useState<Own[]>([]);
  const [all, setAll] = useState<CatRow[]>([]);
  const [tenants, setTenants] = useState<Record<string, string>>({});
  const [l1, setL1] = useState<string | null>(null);
  const [l2, setL2] = useState<string | null>(null);
  const [edit, setEdit] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const db = supabase as any;
    const [m, c, t] = await Promise.all([
      db.from("category_master").select("id,level,name,parent_id,default_group,is_active").order("sort_order").order("name"),
      db.from("product_categories").select("id,name,level,parent_id,master_id,is_active,tenant_id").eq("is_active", true).range(0, 9999),
      db.from("tenants").select("id,name").neq("status", "internal"),
    ]);
    const names = Object.fromEntries(((t.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
    const cats = ((c.data ?? []) as Own[]).filter((x) => names[x.tenant_id]);
    setMaster(m.data ?? []); setAll(cats); setOwn(cats.filter((x) => !x.master_id)); setTenants(names);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const list = (parent: string | null, level: number) => master.filter((x) => x.level === level && x.parent_id === parent);
  const level1 = list(null, 1);
  const pick1 = level1.find((x) => x.id === l1) ?? level1[0];
  const level2 = pick1 ? list(pick1.id, 2) : [];
  const pick2 = level2.find((x) => x.id === l2) ?? level2[0];
  const level3 = pick2 ? list(pick2.id, 3) : [];

  // The same own category at several clients shows once, with every client named.
  const added = useMemo(() => {
    const by = new Map<string, { path: string; rows: Own[]; parentInMaster: boolean }>();
    for (const r of own) {
      const path = pathOf(all, r).join(" › ");
      const parent = r.parent_id ? all.find((x) => x.id === r.parent_id) : null;
      const e = by.get(path.toLowerCase()) ?? { path, rows: [], parentInMaster: !parent || !!parent.master_id };
      e.rows.push(r); by.set(path.toLowerCase(), e);
    }
    return [...by.values()].sort((a, b) => a.path.localeCompare(b.path));
  }, [own, all]);

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const { error } = await (supabase as any).rpc("save_master_category", { p_id: edit.id, p_name: edit.name, p_parent: edit.parent, p_group: edit.level === 1 ? edit.group || null : null, p_active: edit.active });
    setBusy(false);
    if (error) { toast({ title: error.message, variant: "destructive" }); return; }
    toast({ title: edit.id ? "Category saved" : `${edit.name} added for every client` });
    setEdit(null); void load();
  };
  const promote = async (id: string, path: string) => {
    setBusy(true);
    const { error } = await (supabase as any).rpc("promote_client_category", { p_category: id });
    setBusy(false);
    if (error) { toast({ title: error.message, variant: "destructive" }); return; }
    toast({ title: `${path} added to the master list` });
    void load();
  };

  const column = (title: string, rows: Master[], on: Master | undefined, pick: ((id: string) => void) | null, level: 1 | 2 | 3, parent: string | null) =>
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 pb-2">
        <p className="text-[12px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">{title}</p>
        {(level === 1 || parent) && <button type="button" className={link} onClick={() => setEdit({ id: null, level, parent, name: "", group: "", active: true })}>Add</button>}
      </div>
      <ul className="border-t border-[#ECEAE3]">
        {rows.map((r) => <li key={r.id} className={`flex items-center gap-2 ${cell} ${pick && on?.id === r.id ? "bg-black/[0.03] font-medium" : ""}`}>
          <button type="button" className="min-w-0 flex-1 truncate text-left text-[13px]" title={r.name} disabled={!pick} onClick={() => pick?.(r.id)}>
            {r.name}{!r.is_active && <span className="text-muted-foreground font-normal"> · off</span>}
          </button>
          {level === 1 && <span className="text-[12px] text-muted-foreground">{groupLabel(r.default_group ?? "")}</span>}
          <button type="button" className={link} onClick={() => setEdit({ id: r.id, level, parent: r.parent_id, name: r.name, group: r.default_group ?? "", active: r.is_active })}>Edit</button>
        </li>)}
        {!rows.length && <li className={`${cell} flex items-center text-[13px] text-muted-foreground`}>{loading ? "Loading…" : "None yet"}</li>}
      </ul>
    </div>;

  return <div className="px-4 py-5 sm:p-6 space-y-5 max-w-[1100px] mx-auto">
    <h1 className="text-[22px] sm:text-2xl font-semibold tracking-tight">Master categories</h1>
    <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Master categories">
      <p className="px-1 text-[13px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">Every client starts from this list and can add their own</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {column("Level 1", level1, pick1, (id) => { setL1(id); setL2(null); }, 1, null)}
        {column(pick1 ? `Level 2 · ${pick1.name}` : "Level 2", level2, pick2, setL2, 2, pick1?.id ?? null)}
        {column(pick2 ? `Level 3 · ${pick2.name}` : "Level 3", level3, undefined, null, 3, pick2?.id ?? null)}
      </div>
    </section>

    <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Added by clients">
      <h2 className="text-base font-semibold px-1">Added by clients · {added.length}</h2>
      {!added.length ? <p className="p-6 text-center text-sm text-muted-foreground">{loading ? "Loading…" : "No client categories yet."}</p>
      : <div className="overflow-x-auto"><table className="w-full min-w-[560px] border-collapse text-[13px]" aria-label="Added by clients">
        <thead><tr className="text-[12px] text-muted-foreground">{["Category", "Clients", ""].map((h, i) => <th key={i} scope="col" className="h-9 px-2 text-left font-medium whitespace-nowrap border-b border-[#ECEAE3]">{h}</th>)}</tr></thead>
        <tbody>{added.map((a) => <tr key={a.path}>
          <td className={`${cell} font-medium`}>{a.path}</td>
          <td className={cell}>{[...new Set(a.rows.map((r) => tenants[r.tenant_id]))].join(", ")}</td>
          <td className={`${cell} text-right`}>{a.parentInMaster
            ? <button type="button" className={link} disabled={busy} onClick={() => void promote(a.rows[0].id, a.path)}>Add to master</button>
            : <span className="text-muted-foreground">Add its parent first</span>}</td>
        </tr>)}</tbody></table></div>}
    </section>

    <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
      <DialogContent className="!bg-card !backdrop-blur-none">
        <DialogHeader><DialogTitle>{edit?.id ? "Edit category" : `New Level ${edit?.level}`}</DialogTitle>
          <DialogDescription>Every client follows this change.</DialogDescription></DialogHeader>
        {edit && <div className="space-y-3">
          <label className="grid gap-1 text-[12.5px] text-muted-foreground">Name<Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="h-10 text-[14px] text-foreground" /></label>
          {edit.level === 1 && <label className="grid gap-1 text-[12.5px] text-muted-foreground">Group
            <Select value={edit.group} onValueChange={(v) => setEdit({ ...edit, group: v })}><SelectTrigger className="h-10 text-[14px]"><SelectValue placeholder="Select group" /></SelectTrigger>
              <SelectContent>{GROUPS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></label>}
          {edit.id && <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={!edit.active} onChange={(e) => setEdit({ ...edit, active: !e.target.checked })} />Stop offering it to new clients</label>}
        </div>}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
          <Button disabled={busy || !edit?.name.trim() || (edit?.level === 1 && !edit.group)} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}
