import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { ReconMappingRule, BankMovement } from "@/utils/reconciliationMappingRules";

const MOVEMENT_LABEL: Record<string, string> = {
  money_in: "Money In",
  money_out: "Money Out",
  either: "Either",
};

const CLASSIFICATION_OPTIONS = [
  "Merchant Settlement", "Bank Fee", "Supplier Payment", "Supplier Refund",
  "Cash Deposit", "Internal Transfer", "Payroll Payment", "Payment Return",
  "Interest Income", "Other",
];

type FormState = Partial<ReconMappingRule> & { bank_movement?: BankMovement };

const EMPTY: FormState = {
  rule_name: "",
  bank_description_contains: "",
  bank_movement: "either",
  counterparty_type: "",
  classification: "Other",
  match_to: "",
  source_required: false,
  debit_account: "",
  credit_account: "",
  review_required: true,
  auto_post: false,
  is_active: true,
  sort_order: 0,
};

export function MappingRulesTab() {
  const [rules, setRules] = useState<ReconMappingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("reconciliation_mapping_rules" as any)
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) toast({ title: "Failed to load rules", description: error.message, variant: "destructive" });
    setRules((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.rule_name?.trim()) { toast({ title: "Rule name required", variant: "destructive" }); return; }
    if (!editing.bank_description_contains?.trim()) { toast({ title: "Bank description match required", variant: "destructive" }); return; }
    setSaving(true);
    const payload = {
      rule_name: editing.rule_name.trim(),
      bank_description_contains: editing.bank_description_contains.trim(),
      bank_movement: editing.bank_movement || "either",
      counterparty_type: editing.counterparty_type || "",
      classification: editing.classification || "Other",
      match_to: editing.match_to || "",
      source_required: !!editing.source_required,
      debit_account: editing.debit_account || "",
      credit_account: editing.credit_account || "",
      review_required: !!editing.review_required,
      auto_post: !!editing.auto_post,
      is_active: editing.is_active ?? true,
      sort_order: Number(editing.sort_order || 0),
    };
    const q = editing.id
      ? supabase.from("reconciliation_mapping_rules" as any).update(payload).eq("id", editing.id)
      : supabase.from("reconciliation_mapping_rules" as any).insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing.id ? "Rule updated" : "Rule created" });
    setEditing(null);
    load();
  };

  const remove = async (r: ReconMappingRule) => {
    if (!confirm(`Delete rule "${r.rule_name}"?`)) return;
    const { error } = await supabase.from("reconciliation_mapping_rules" as any).delete().eq("id", r.id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Rule deleted" });
    load();
  };

  return (
    <Card className="card-glass">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Reconciliation Mapping Rules</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            These rules suggest classification and matching for incoming bank transactions. Suggestions are never auto-posted — every match requires user approval.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing({ ...EMPTY, sort_order: rules.length * 10 })}>
          <Plus className="h-4 w-4" /> Add Rule
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left py-2 px-2">Rule Name</th>
              <th className="text-left py-2 px-2">Bank Description Contains</th>
              <th className="text-left py-2 px-2">Bank Movement</th>
              <th className="text-left py-2 px-2">Counterparty</th>
              <th className="text-left py-2 px-2">Classification</th>
              <th className="text-left py-2 px-2">Match To</th>
              <th className="text-left py-2 px-2">Source Req.</th>
              <th className="text-left py-2 px-2">Debit Account</th>
              <th className="text-left py-2 px-2">Credit Account</th>
              <th className="text-left py-2 px-2">Review</th>
              <th className="text-left py-2 px-2">Auto Post</th>
              <th className="text-left py-2 px-2">Active</th>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={13} className="text-center py-8 text-muted-foreground">Loading…</td></tr>}
            {!loading && rules.length === 0 && <tr><td colSpan={13} className="text-center py-8 text-muted-foreground">No mapping rules yet. Click "Add Rule" to create one.</td></tr>}
            {rules.map((r) => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-card/50">
                <td className="py-2 px-2 font-medium">{r.rule_name}</td>
                <td className="py-2 px-2 font-mono text-xs">{r.bank_description_contains}</td>
                <td className="py-2 px-2">
                  <span className={`chip ${r.bank_movement === "money_in" ? "chip-success" : r.bank_movement === "money_out" ? "chip-danger" : "chip-neutral"}`}>
                    <span /> {MOVEMENT_LABEL[r.bank_movement] || r.bank_movement}
                  </span>
                </td>
                <td className="py-2 px-2 text-muted-foreground">{r.counterparty_type || "—"}</td>
                <td className="py-2 px-2">{r.classification}</td>
                <td className="py-2 px-2 text-muted-foreground">{r.match_to || "—"}</td>
                <td className="py-2 px-2">{r.source_required ? <span className="chip chip-warn"><span /> Yes</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="py-2 px-2 text-xs">{r.debit_account || "—"}</td>
                <td className="py-2 px-2 text-xs">{r.credit_account || "—"}</td>
                <td className="py-2 px-2">{r.review_required ? <span className="chip chip-info"><span /> Yes</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="py-2 px-2">{r.auto_post ? <span className="chip chip-success"><span /> Yes</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="py-2 px-2">{r.is_active ? <span className="chip chip-success"><span /> Active</span> : <span className="chip chip-neutral"><span /> Inactive</span>}</td>
                <td className="py-2 px-2 text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(r)}><Pencil className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(r)}><Trash2 className="h-3 w-3" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Mapping Rule" : "New Mapping Rule"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Rule Name *</Label>
                <Input value={editing.rule_name || ""} onChange={(e) => setEditing({ ...editing, rule_name: e.target.value })} placeholder="e.g. KPay Settlement" />
              </div>
              <div className="col-span-2">
                <Label>Bank Description Contains *</Label>
                <Input value={editing.bank_description_contains || ""} onChange={(e) => setEditing({ ...editing, bank_description_contains: e.target.value })} placeholder="Case-insensitive substring match" />
              </div>
              <div>
                <Label>Bank Movement</Label>
                <Select value={editing.bank_movement || "either"} onValueChange={(v) => setEditing({ ...editing, bank_movement: v as BankMovement })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="money_in">Money In</SelectItem>
                    <SelectItem value="money_out">Money Out</SelectItem>
                    <SelectItem value="either">Either</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Classification</Label>
                <Select value={editing.classification || "Other"} onValueChange={(v) => setEditing({ ...editing, classification: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLASSIFICATION_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Counterparty Type</Label>
                <Input value={editing.counterparty_type || ""} onChange={(e) => setEditing({ ...editing, counterparty_type: e.target.value })} placeholder="e.g. Supplier, Bank, Merchant" />
              </div>
              <div>
                <Label>Match To</Label>
                <Input value={editing.match_to || ""} onChange={(e) => setEditing({ ...editing, match_to: e.target.value })} placeholder="e.g. KPay Report, Supplier Invoice" />
              </div>
              <div>
                <Label>Debit Account</Label>
                <Input value={editing.debit_account || ""} onChange={(e) => setEditing({ ...editing, debit_account: e.target.value })} placeholder="e.g. 1000 Cash at Bank" />
              </div>
              <div>
                <Label>Credit Account</Label>
                <Input value={editing.credit_account || ""} onChange={(e) => setEditing({ ...editing, credit_account: e.target.value })} placeholder="e.g. 1200 Merchant Receivables" />
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input type="number" value={String(editing.sort_order ?? 0)} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
              </div>
              <div className="col-span-2 grid grid-cols-2 gap-3 pt-2 border-t border-border">
                <label className="flex items-center justify-between gap-2">
                  <span className="text-sm">Source Required</span>
                  <Switch checked={!!editing.source_required} onCheckedChange={(v) => setEditing({ ...editing, source_required: v })} />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-sm">Review Required</span>
                  <Switch checked={!!editing.review_required} onCheckedChange={(v) => setEditing({ ...editing, review_required: v })} />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-sm">Auto Post</span>
                  <Switch checked={!!editing.auto_post} onCheckedChange={(v) => setEditing({ ...editing, auto_post: v })} />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-sm">Active</span>
                  <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Rule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
