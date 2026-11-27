import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { MASTER_COA_TEMPLATE_ID, COA_GROUPS, groupDefaults, type MasterAccount } from "@/utils/coaMaster";

// Control plane › Chart of accounts: Bani's master chart (the "F&B — Hong Kong" template). New clients load it
// (additive: codes a client already has are skipped); existing clients' books never change from here.
// System accounts are locked in each client's chart once loaded. Only platform admins can save (RLS).
type Edit = MasterAccount & { index: number | null };

export default function MasterChart() {
  const [rows, setRows] = useState<MasterAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void supabase.from("coa_templates").select("template").eq("id", MASTER_COA_TEMPLATE_ID).maybeSingle().then(({ data, error }) => {
      if (error) toast.error(error.message);
      setRows(((data?.template as unknown) as MasterAccount[]) ?? []);
      setLoading(false);
    });
  }, []);
  const groups = useMemo(() => COA_GROUPS.map(g => ({ g, list: rows.map((r, i) => ({ r, i })).filter(x => (x.r.group ?? "") === g).sort((a, b) => a.r.code.localeCompare(b.r.code)) })), [rows]);

  const save = async (next: MasterAccount[]) => {
    setBusy(true);
    const sorted = [...next].sort((a, b) => a.code.localeCompare(b.code)).map((r, i) => ({ ...r, sort_order: (i + 1) * 10 }));
    const { error } = await supabase.from("coa_templates").update({ template: sorted as any, updated_at: new Date().toISOString() }).eq("id", MASTER_COA_TEMPLATE_ID);
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    setRows(sorted); return true;
  };
  const submit = async () => {
    if (!edit) return;
    const code = edit.code.trim(), name = edit.name.trim();
    if (!/^\d{3,6}$/.test(code) || !name) return toast.error("Add a number code (3–6 digits) and a name");
    if (rows.some((r, i) => r.code === code && i !== edit.index)) return toast.error(`Code ${code} is already used`);
    const { index, ...acct } = edit;
    const row = { ...acct, code, name, ...groupDefaults(acct.group, code, acct.normal_side) };
    const next = index == null ? [...rows, row] : rows.map((r, i) => (i === index ? row : r));
    if (await save(next)) { toast.success("Saved. New clients get it; existing clients can add it."); setEdit(null); }
  };
  const remove = async () => {
    if (!edit || edit.index == null) return;
    if (await save(rows.filter((_, i) => i !== edit.index))) { toast.success("Removed from the master"); setEdit(null); }
  };

  const th = "h-9 border-b border-border px-2 text-left text-[12px] font-normal text-muted-foreground";
  const td = "h-11 border-b border-border/50 px-2 text-[13px] whitespace-nowrap";
  return <div className="px-4 py-5 sm:p-6 space-y-4 max-w-[1100px] mx-auto">
    <div className="flex items-start justify-between gap-3">
      <div><h1 className="text-[22px] sm:text-2xl font-semibold tracking-tight">Master chart of accounts</h1>
        <p className="text-[13px] text-muted-foreground">Hong Kong restaurants · {rows.length} accounts · {rows.filter(r => r.is_system).length} system accounts. New clients start from this; existing clients' books are never changed.</p></div>
      <Button className="rounded-full" onClick={() => setEdit({ code: "", name: "", group: "Operating expenses", account_type: "opex", normal_side: "debit", is_system: false, is_cash: false, sort_order: 0, index: null })}><Plus className="h-4 w-4" />Add account</Button>
    </div>
    {loading ? <p className="text-[13px] text-muted-foreground">Loading…</p>
      : <div className="rounded-2xl border border-border bg-card p-4 overflow-x-auto"><table className="w-full">
        <thead><tr><th className={th}>Code</th><th className={th}>Account</th><th className={th}>Side</th><th className={`${th} text-right`}>System</th></tr></thead>
        <tbody>{groups.filter(g => g.list.length).map(({ g, list }) => <Fragment key={g}>
          <tr><td colSpan={4} className="pt-4 pb-1 px-2 text-[13px] font-semibold">{g} <span className="font-normal text-muted-foreground">· {list.length}</span></td></tr>
          {list.map(({ r, i }) => <tr key={r.code} className="cursor-pointer hover:bg-muted/40" onClick={() => setEdit({ ...r, index: i })}>
            <td className={`${td} tabular-nums text-muted-foreground`}>{r.code}</td>
            <td className={td}>{r.name}</td>
            <td className={`${td} text-muted-foreground`}>{r.normal_side === "debit" ? "Debit" : "Credit"}</td>
            <td className={`${td} text-right`}>{r.is_system ? <span className="rounded-md bg-muted px-1.5 py-px text-[11px] text-muted-foreground">🔒 System</span> : ""}</td>
          </tr>)}
        </Fragment>)}</tbody></table></div>}

    <Dialog open={!!edit} onOpenChange={o => { if (!o) setEdit(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{edit?.index == null ? "Add account" : `Edit ${edit?.code}`}</DialogTitle></DialogHeader>
        {edit && <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <div><Label className="text-xs">Code</Label><Input inputMode="numeric" value={edit.code} onChange={e => setEdit({ ...edit, code: e.target.value })} /></div>
            <div><Label className="text-xs">Name</Label><Input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Group</Label>
              <Select value={edit.group} onValueChange={v => setEdit({ ...edit, group: v, ...groupDefaults(v, edit.code) })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{COA_GROUPS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Normal side</Label>
              <Select value={edit.normal_side} onValueChange={v => setEdit({ ...edit, normal_side: v as "debit" | "credit" })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="debit">Debit</SelectItem><SelectItem value="credit">Credit</SelectItem></SelectContent></Select></div>
          </div>
          <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-[13px]">System account (Bani posts to it; clients can't delete or change it)<Switch checked={edit.is_system} onCheckedChange={c => setEdit({ ...edit, is_system: c })} /></label>
        </div>}
        <DialogFooter className="gap-2">
          {edit?.index != null && <Button variant="ghost" className="mr-auto text-destructive" disabled={busy} onClick={remove}>Remove</Button>}
          <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button disabled={busy} onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
