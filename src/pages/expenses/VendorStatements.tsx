import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { useVendorStatements, VendorStatement } from "@/hooks/useVendorStatements";
import { supabase } from "@/integrations/supabase/client";

const fmt = (n: number) =>
  `HK$ ${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function VendorStatements() {
  const { statements, save, remove, loading } = useVendorStatements();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<VendorStatement>>({});
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      const [s, v] = await Promise.all([
        supabase.from("suppliers").select("id,name").order("name"),
        supabase.from("venues").select("id,name").order("name"),
      ]);
      setSuppliers((s.data || []) as any);
      setVenues((v.data || []) as any);
    })();
  }, []);

  const openNew = () => {
    setEditing({
      statement_date: new Date().toISOString().slice(0, 10),
      currency: "HKD",
      opening_balance: 0,
      current_period_charges: 0,
      payments_credits: 0,
      late_fees: 0,
      closing_balance: 0,
      status: "draft",
      approval_status: "draft",
      payment_status: "unpaid",
    });
    setOpen(true);
  };

  const setField = (k: keyof VendorStatement, v: any) => setEditing((p) => ({ ...p, [k]: v }));

  const recomputeClosing = () => {
    const op = Number(editing.opening_balance || 0);
    const ch = Number(editing.current_period_charges || 0);
    const pc = Number(editing.payments_credits || 0);
    const lf = Number(editing.late_fees || 0);
    setField("closing_balance", op + ch + lf - pc);
  };

  const handleSave = async () => {
    if (!editing.statement_date) return;
    const ok = await save(editing);
    if (ok) setOpen(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold">Vendor Statements</h1>
          <p className="text-sm text-muted-foreground">
            Only current period charges and late fees post to P&L. Opening balance is treated as prior AP.
          </p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> New Statement</Button>
      </div>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Statement #</TableHead>
              <TableHead className="text-right">Opening</TableHead>
              <TableHead className="text-right">Current Charges</TableHead>
              <TableHead className="text-right">Payments/Credits</TableHead>
              <TableHead className="text-right">Late Fees</TableHead>
              <TableHead className="text-right">Closing</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statements.map((s) => (
              <TableRow
                key={s.id}
                className="cursor-pointer"
                onClick={() => {
                  setEditing(s);
                  setOpen(true);
                }}
              >
                <TableCell>{dt(s.statement_date)}</TableCell>
                <TableCell>{s.vendor_name || "—"}</TableCell>
                <TableCell>{s.statement_number || "—"}</TableCell>
                <TableCell className="text-right td-num">{fmt(s.opening_balance)}</TableCell>
                <TableCell className="text-right td-num font-medium">{fmt(s.current_period_charges)}</TableCell>
                <TableCell className="text-right td-num">{fmt(s.payments_credits)}</TableCell>
                <TableCell className="text-right td-num">{fmt(s.late_fees)}</TableCell>
                <TableCell className="text-right td-num">{fmt(s.closing_balance)}</TableCell>
                <TableCell><Badge variant="outline">{s.approval_status}</Badge></TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete statement?")) remove(s.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!statements.length && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  {loading ? "Loading…" : "No statements yet"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[640px] sm:max-w-[640px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing.id ? "Edit Statement" : "New Vendor Statement"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vendor</Label>
                <Select
                  value={editing.supplier_id || ""}
                  onValueChange={(v) => {
                    const sup = suppliers.find((s) => s.id === v);
                    setEditing((p) => ({ ...p, supplier_id: v, vendor_name: sup?.name || p.vendor_name }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Statement #</Label>
                <Input value={editing.statement_number || ""} onChange={(e) => setField("statement_number", e.target.value)} />
              </div>
              <div>
                <Label>Statement Date</Label>
                <Input type="date" value={editing.statement_date || ""} onChange={(e) => setField("statement_date", e.target.value)} />
              </div>
              <div>
                <Label>Venue</Label>
                <Select value={editing.venue_id || ""} onValueChange={(v) => setField("venue_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {venues.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Period Start</Label>
                <Input type="date" value={editing.period_start || ""} onChange={(e) => setField("period_start", e.target.value)} />
              </div>
              <div>
                <Label>Period End</Label>
                <Input type="date" value={editing.period_end || ""} onChange={(e) => setField("period_end", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t pt-4">
              <div>
                <Label>Opening Balance <span className="text-muted-foreground text-xs">(prior AP, not posted)</span></Label>
                <Input type="number" step="0.01" value={editing.opening_balance ?? 0} onChange={(e) => setField("opening_balance", e.target.value)} onBlur={recomputeClosing} />
              </div>
              <div>
                <Label>Current Period Charges <span className="text-emerald-500 text-xs">(posts to P&L)</span></Label>
                <Input type="number" step="0.01" value={editing.current_period_charges ?? 0} onChange={(e) => setField("current_period_charges", e.target.value)} onBlur={recomputeClosing} />
              </div>
              <div>
                <Label>Payments / Credits</Label>
                <Input type="number" step="0.01" value={editing.payments_credits ?? 0} onChange={(e) => setField("payments_credits", e.target.value)} onBlur={recomputeClosing} />
              </div>
              <div>
                <Label>Late Fees <span className="text-emerald-500 text-xs">(posts to P&L)</span></Label>
                <Input type="number" step="0.01" value={editing.late_fees ?? 0} onChange={(e) => setField("late_fees", e.target.value)} onBlur={recomputeClosing} />
              </div>
              <div className="col-span-2">
                <Label>Closing Balance</Label>
                <Input type="number" step="0.01" value={editing.closing_balance ?? 0} onChange={(e) => setField("closing_balance", e.target.value)} />
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
