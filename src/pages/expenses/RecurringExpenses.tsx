import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { useRecurringExpenses, RecurringRule } from "@/hooks/useRecurringExpenses";
import { supabase } from "@/integrations/supabase/client";

const fmt = (n: number) =>
  `HK$ ${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function RecurringExpenses() {
  const { rules, save, remove, toggleActive, loading } = useRecurringExpenses();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<RecurringRule>>({});
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      const [s, v, c, a] = await Promise.all([
        supabase.from("suppliers").select("id,name").order("name"),
        supabase.from("venues").select("id,name").order("name"),
        supabase.from("expense_categories").select("id,name").order("name"),
        supabase.from("chart_of_accounts").select("id,code,name").order("code"),
      ]);
      setSuppliers((s.data || []) as any);
      setVenues((v.data || []) as any);
      setCategories((c.data || []) as any);
      setAccounts((a.data || []) as any);
    })();
  }, []);

  const openNew = () => {
    setEditing({ cadence: "monthly", currency: "HKD", active: true, expected_amount: 0 });
    setOpen(true);
  };

  const setField = (k: keyof RecurringRule, v: any) => setEditing((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!editing.name) return;
    const ok = await save(editing);
    if (ok) setOpen(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold">Recurring Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Rules for rent, service charge, subscriptions, insurance, cleaning, pest control, equipment rental.
          </p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> New Rule</Button>
      </div>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Cadence</TableHead>
              <TableHead>Next Due</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => { setEditing(r); setOpen(true); }}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.vendor_name || "—"}</TableCell>
                <TableCell><Badge variant="outline">{r.cadence}</Badge></TableCell>
                <TableCell>{dt(r.next_due_date)}</TableCell>
                <TableCell className="text-right td-num">{fmt(r.expected_amount)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Switch checked={r.active} onCheckedChange={(v) => toggleActive(r.id, v)} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete rule?")) remove(r.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!rules.length && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {loading ? "Loading…" : "No recurring rules"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[560px] sm:max-w-[560px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing.id ? "Edit Rule" : "New Recurring Rule"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 mt-4">
            <div>
              <Label>Name</Label>
              <Input value={editing.name || ""} onChange={(e) => setField("name", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vendor</Label>
                <Select value={editing.supplier_id || ""} onValueChange={(v) => {
                  const sup = suppliers.find((s) => s.id === v);
                  setEditing((p) => ({ ...p, supplier_id: v, vendor_name: sup?.name || p.vendor_name }));
                }}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cadence</Label>
                <Select value={editing.cadence || "monthly"} onValueChange={(v) => setField("cadence", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={editing.category_id || ""} onValueChange={(v) => setField("category_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Account</Label>
                <Select value={editing.account_id || ""} onValueChange={(v) => setField("account_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Venue</Label>
                <Select
                  value={editing.combined_venues ? "__combined__" : (editing.venue_id || "")}
                  onValueChange={(v) => {
                    if (v === "__combined__") {
                      setEditing((p) => ({ ...p, combined_venues: true, venue_id: null }));
                    } else {
                      setEditing((p) => ({ ...p, combined_venues: false, venue_id: v }));
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__combined__">All Venues / Combined</SelectItem>
                    {venues.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Department</Label>
                <Input value={editing.department || ""} onChange={(e) => setField("department", e.target.value)} />
              </div>
              <div>
                <Label>Expected Amount</Label>
                <Input type="number" step="0.01" value={editing.expected_amount ?? 0} onChange={(e) => setField("expected_amount", e.target.value)} />
              </div>
              <div>
                <Label>Next Due Date</Label>
                <Input type="date" value={editing.next_due_date || ""} onChange={(e) => setField("next_due_date", e.target.value)} />
              </div>
              <div>
                <Label>Recognition Day</Label>
                <Select
                  value={editing.recognition_day ?? (editing.day_of_month ? String(Math.min(editing.day_of_month, 28)) : "")}
                  onValueChange={(v) => setEditing((p) => ({
                    ...p,
                    recognition_day: v,
                    day_of_month: v === "last" ? null : Number(v),
                  }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select day" /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>{`Day ${d}`}</SelectItem>
                    ))}
                    <SelectItem value="last">Last day of month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={editing.active ?? true} onCheckedChange={(v) => setField("active", v)} />
                <Label>Active</Label>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={editing.notes || ""} onChange={(e) => setField("notes", e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>Save</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
