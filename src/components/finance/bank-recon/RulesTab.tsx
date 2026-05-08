import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import { SUGGESTED_TYPE_LABEL, type UserRule } from "@/utils/bankTxnRules";

export function RulesTab() {
  const [rules, setRules] = useState<UserRule[]>([]);
  const [name, setName] = useState("");
  const [matchContains, setMatchContains] = useState("");
  const [type, setType] = useState("bank_fee");
  const [category, setCategory] = useState("");

  const load = async () => {
    const { data } = await supabase.from("bank_recon_rules" as any).select("*").order("sort_order").order("created_at");
    setRules((data as any) || []);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name || !matchContains) { toast({ title: "Name and match text required", variant: "destructive" }); return; }
    const { error } = await supabase.from("bank_recon_rules" as any).insert({
      name, match_contains: matchContains, suggested_type: type, suggested_category: category || null,
    });
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { setName(""); setMatchContains(""); setCategory(""); load(); }
  };

  const remove = async (id: string) => {
    await supabase.from("bank_recon_rules" as any).delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-4">
      <Card className="card-glass">
        <CardHeader><CardTitle className="text-base">Add Rule</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <div><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="JP-GAS = utilities/gas" /></div>
          <div><Label className="text-xs">Description contains</Label><Input value={matchContains} onChange={(e) => setMatchContains(e.target.value)} placeholder="JP-GAS" /></div>
          <div>
            <Label className="text-xs">Suggested type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SUGGESTED_TYPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Category (optional)</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Utilities - Gas" /></div>
          <div className="flex items-end"><Button onClick={add} className="w-full"><Plus className="h-4 w-4" /> Add</Button></div>
        </CardContent>
      </Card>

      <Card className="card-glass">
        <CardHeader><CardTitle className="text-base">Rules</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground border-b border-border">
              <tr><th className="text-left py-2 px-2">Name</th><th className="text-left py-2 px-2">Match</th><th className="text-left py-2 px-2">Type</th><th className="text-left py-2 px-2">Category</th><th className="text-left py-2 px-2">Active</th><th></th></tr>
            </thead>
            <tbody>
              {rules.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">No custom rules. Built-in patterns are always applied.</td></tr>}
              {rules.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="py-2 px-2 font-medium">{r.name}</td>
                  <td className="py-2 px-2 font-mono text-xs">{r.match_contains}</td>
                  <td className="py-2 px-2">{SUGGESTED_TYPE_LABEL[r.suggested_type] || r.suggested_type}</td>
                  <td className="py-2 px-2 text-muted-foreground">{r.suggested_category || "—"}</td>
                  <td className="py-2 px-2">{r.is_active ? <span className="chip chip-success">Active</span> : <span className="chip chip-neutral">Off</span>}</td>
                  <td className="py-2 px-2 text-right"><Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-3 w-3" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
