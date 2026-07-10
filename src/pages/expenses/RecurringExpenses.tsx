import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, PlayCircle, Repeat } from "lucide-react";
import { Link } from "react-router-dom";
import { useRecurringExpenses, RecurringRule, RecurringRuleStatus } from "@/hooks/useRecurringExpenses";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { supabase } from "@/integrations/supabase/client";
import {
  PageHeader,
  StatusPill,
  StatusVariant,
  TableSkeleton,
  EmptyState,
  fmtHK,
  fmtDate,
  ScopeLine,
} from "@/components/expenses/shared";

const STATUS_VARIANT: Record<RecurringRuleStatus, StatusVariant> = {
  draft: "muted",
  active: "success",
  paused: "warning",
  ended: "destructive",
};

function computeNextGeneration(r: Partial<RecurringRule>): string | null {
  if (!r.effective_from) return null;
  const eff = new Date(r.effective_from + "T00:00:00");
  let monthStart = new Date(eff.getFullYear(), eff.getMonth(), 1);
  for (let i = 0; i < 60; i++) {
    let candidate: Date;
    const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    if (r.recognition_day === "last") {
      candidate = new Date(monthStart.getFullYear(), monthStart.getMonth(), lastDay);
    } else {
      const day = Math.min(Number(r.recognition_day || r.day_of_month || 1), lastDay);
      candidate = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
    }
    if (candidate >= eff) {
      return candidate.toISOString().slice(0, 10);
    }
    if (r.cadence === "weekly") monthStart = new Date(monthStart.getTime() + 7 * 86400000);
    else if (r.cadence === "quarterly") monthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 3, 1);
    else if (r.cadence === "yearly") monthStart = new Date(monthStart.getFullYear() + 1, monthStart.getMonth(), 1);
    else monthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  }
  return null;
}

export default function RecurringExpenses() {
  const { rules, save, remove, setStatus, generateNow, loading } = useRecurringExpenses();
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
    setEditing({
      cadence: "monthly",
      currency: "HKD",
      status: "draft",
      active: false,
      auto_approve: false,
      expected_amount: 0,
      effective_from: new Date().toISOString().slice(0, 10),
    });
    setOpen(true);
  };

  const setField = (k: keyof RecurringRule, v: any) => setEditing((p) => ({ ...p, [k]: v }));

  const previewNextGen = useMemo(() => computeNextGeneration(editing), [editing]);

  const handleSave = async () => {
    if (!editing.name) return;
    const ok = await save(editing);
    if (ok) setOpen(false);
  };

  const activeCount = rules.filter((r) => r.status === "active").length;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Recurring Expenses"
        description="Rules act as templates. Active rules generate a pending-approval bill in Expenses → Approvals each period."
        actions={
          <>
            <Button variant="outline" size="sm" className="h-9" onClick={generateNow}>
              <PlayCircle className="h-4 w-4 mr-1" /> Generate due now
            </Button>
            <Button size="sm" className="h-9" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> New rule
            </Button>
          </>
        }
      />

      <ScopeLine>
        {rules.length} rule{rules.length === 1 ? "" : "s"} · {activeCount} active
      </ScopeLine>

      <Card className="card-glass p-0 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={4} cols={7} />
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Name</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Cadence</TableHead>
                  <TableHead>Next generation</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => { setEditing(r); setOpen(true); }}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.vendor_name || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><StatusPill variant="neutral">{r.cadence}</StatusPill></TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(r.next_generation_date)}</TableCell>
                    <TableCell className="text-right td-num tabular-nums whitespace-nowrap">{fmtHK(r.expected_amount)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select value={r.status || "draft"} onValueChange={(v) => setStatus(r.id, v as RecurringRuleStatus)}>
                        <SelectTrigger className="h-8 w-[120px]">
                          <StatusPill variant={STATUS_VARIANT[r.status || "draft"]}>{r.status || "draft"}</StatusPill>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="paused">Paused</SelectItem>
                          <SelectItem value="ended">Ended</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete rule?")) remove(r.id); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!rules.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="p-0">
                      <EmptyState
                        icon={<Repeat className="h-6 w-6" />}
                        title="No recurring rules yet"
                        description="Templates for rent, utilities, insurance — bills generate automatically each period so nothing is missed."
                        action={
                          <div className="flex gap-2">
                            <Button size="sm" className="h-8" onClick={openNew}>
                              <Plus className="h-3 w-3 mr-1" /> Add first rule
                            </Button>
                            <Link to="/expenses/vendors">
                              <Button size="sm" variant="outline" className="h-8">Add a vendor first</Button>
                            </Link>
                          </div>
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[560px] sm:max-w-[560px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing.id ? "Edit Rule" : "New Recurring Rule"}</SheetTitle>
            <p className="text-xs text-muted-foreground mt-1">
              This rule is a template. Edits only affect future generated bills — approved or posted bills are untouched.
            </p>
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
                <Label>Account (Debit)</Label>
                <Select value={editing.account_id || ""} onValueChange={(v) => setField("account_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Credit Account (optional override)</Label>
                <Select value={editing.credit_account_id || ""} onValueChange={(v) => setField("credit_account_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Defaults to Accounts Payable" /></SelectTrigger>
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
                <Label>Effective From</Label>
                <Input type="date" value={editing.effective_from || ""} onChange={(e) => setField("effective_from", e.target.value)} />
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
              <div>
                <Label>Payment Due Day (optional)</Label>
                <Select
                  value={editing.payment_due_day ? String(editing.payment_due_day) : "__none__"}
                  onValueChange={(v) => setField("payment_due_day", v === "__none__" ? null : Number(v))}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>{`Day ${d}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">For cash-flow forecasts only.</p>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={editing.status || "draft"}
                  onValueChange={(v) => setField("status", v as RecurringRuleStatus)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="ended">Ended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Next Generation Date (auto): </span>
                <span className="font-mono">{fmtDate(editing.next_generation_date || previewNextGen)}</span>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch checked={editing.auto_approve ?? false} onCheckedChange={(v) => setField("auto_approve", v)} />
                <div>
                  <Label>Auto-approve generated bills</Label>
                  <p className="text-[10px] text-muted-foreground">Off by default. When on, generated bills skip approval and post immediately.</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-dashed border-muted-foreground/25 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Supporting Documents</h4>
              <div>
                <Label>Document Source</Label>
                <Select value={editing.document_source || ""} onValueChange={(v) => setField("document_source", v)}>
                  <SelectTrigger><SelectValue placeholder="Select document type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contract_lease">Contract / Lease</SelectItem>
                    <SelectItem value="supplier_invoice">Supplier Invoice</SelectItem>
                    <SelectItem value="supplier_statement">Supplier Statement</SelectItem>
                    <SelectItem value="bank_record">Bank Record</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Document Notes</Label>
                <Textarea
                  value={editing.document_notes || ""}
                  onChange={(e) => setField("document_notes", e.target.value)}
                  placeholder="Reference numbers, file locations, or other details about the supporting document"
                />
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
