// "Paid by someone else": who paid a supplier invoice or bill. The supplier is settled and the business now owes that person
// (staff → Other payables, director → Director's loan, group company → Due to related companies), shown in Payables.
import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { PAID_BY_KINDS, type PaidByKind } from "@/utils/paidBy";

export type PaidBy = { kind: PaidByKind; name: string };

/** Names already used for this kind (staff from People, and anyone who paid before), to pick from. */
function useKnownPayers(kind: PaidByKind) {
  const { tenantId } = useActiveTenant();
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (!tenantId) return;
    let on = true;
    const db = supabase as any;
    void Promise.all([
      db.from("owed_to_others").select("name").eq("tenant_id", tenantId).eq("kind", kind).limit(200),
      kind === "staff" ? db.from("hr_employees").select("first_name,last_name,status").eq("tenant_id", tenantId).limit(500) : Promise.resolve({ data: [] }),
    ]).then(([owed, emps]: any[]) => {
      if (!on) return;
      const list = [...(owed.data ?? []).map((r: any) => r.name), ...(emps.data ?? []).filter((e: any) => e.status !== "terminated").map((e: any) => `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim())];
      setNames([...new Set(list.filter(Boolean))].sort());
    });
    return () => { on = false; };
  }, [tenantId, kind]);
  return names;
}

export function PaidByFields({ value, onChange }: { value: PaidBy; onChange: (v: PaidBy) => void }) {
  const names = useKnownPayers(value.kind);
  const listId = `paid-by-${value.kind}`;
  return <div className="grid grid-cols-2 gap-3 min-w-0">
    <div className="space-y-1.5 min-w-0"><Label>Who paid</Label>
      <Select value={value.kind} onValueChange={k => onChange({ kind: k as PaidByKind, name: "" })}>
        <SelectTrigger aria-label="Who paid"><SelectValue /></SelectTrigger>
        <SelectContent>{PAID_BY_KINDS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
      </Select></div>
    <div className="space-y-1.5 min-w-0"><Label>{value.kind === "group_company" ? "Company" : "Name"}</Label>
      <Input aria-label="Name of who paid" list={listId} value={value.name} maxLength={120} placeholder={value.kind === "director" ? "e.g. Prashant" : value.kind === "group_company" ? "e.g. KHAMBU Group Ltd" : "Their name"} onChange={e => onChange({ ...value, name: e.target.value })} />
      <datalist id={listId}>{names.map(n => <option key={n} value={n} />)}</datalist></div>
  </div>;
}

/** One line saying what happens, under the fields. */
export function PaidByNote({ value, supplier, amount }: { value: PaidBy; supplier: string; amount: string }) {
  const who = value.name.trim() || "them";
  const where = PAID_BY_KINDS.find(k => k.value === value.kind)?.owedIn ?? "Payables";
  return <div className="rounded-lg border bg-white p-3 text-[13px]">
    <p className="font-medium">{supplier} is paid. You now owe {who} {amount}.</p>
    <p className="text-muted-foreground">Shows in Payables until you pay {value.kind === "group_company" ? "it" : "them"} back · {where}</p>
  </div>;
}
