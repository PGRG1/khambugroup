import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, FileStack } from "lucide-react";
import { useVendorStatements, VendorStatement } from "@/hooks/useVendorStatements";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { supabase } from "@/integrations/supabase/client";
import {
  PageHeader,
  StatusPill,
  TableSkeleton,
  EmptyState,
  approvalVariant,
  APPROVAL_LABEL,
  fmtHK,
  fmtDate,
  ScopeLine,
} from "@/components/expenses/shared";

export default function VendorStatements() {
  const { tenantId } = useActiveTenant();
  const { statements, save, remove, loading } = useVendorStatements();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<VendorStatement>>({});
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const [s, v] = await Promise.all([
        supabase.from("suppliers").select("id,name").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
        supabase.from("venues").select("id,name").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
      ]);
      setSuppliers((s.data || []) as any);
      setVenues((v.data || []) as any);
    })();
  }, [tenantId]);

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
      <PageHeader
        title="Vendor Statements"
        description="Only current period charges and late fees post to P&L. Opening balance is treated as prior AP."
        actions={
          <Button size="sm" className="h-9" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> New statement
          </Button>
        }
      />

      <ScopeLine>{statements.length} statement{statements.length === 1 ? "" : "s"}</ScopeLine>

      <Card className="card-glass p-0 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={4} cols={10} />
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Date</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Statement #</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Current charges</TableHead>
                  <TableHead className="text-right">Payments / credits</TableHead>
                  <TableHead className="text-right">Late fees</TableHead>
                  <TableHead className="text-right">Closing</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statements.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => { setEditing(s); setOpen(true); }}
                  >
                    <TableCell className="whitespace-nowrap">{fmtDate(s.statement_date)}</TableCell>
                    <TableCell>{s.vendor_name || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-xs">{s.statement_number || "—"}</TableCell>
                    <TableCell className="text-right td-num tabular-nums whitespace-nowrap">{fmtHK(s.opening_balance)}</TableCell>
                    <TableCell className="text-right td-num tabular-nums whitespace-nowrap font-medium">{fmtHK(s.current_period_charges)}</TableCell>
                    <TableCell className="text-right td-num tabular-nums whitespace-nowrap">{fmtHK(s.payments_credits)}</TableCell>
                    <TableCell className="text-right td-num tabular-nums whitespace-nowrap">{fmtHK(s.late_fees)}</TableCell>
                    <TableCell className="text-right td-num tabular-nums whitespace-nowrap">{fmtHK(s.closing_balance)}</TableCell>
                    <TableCell>
                      <StatusPill variant={approvalVariant(s.approval_status)}>
                        {APPROVAL_LABEL[s.approval_status] || s.approval_status}
                      </StatusPill>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Delete statement?")) remove(s.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!statements.length && (
                  <TableRow>
                    <TableCell colSpan={10} className="p-0">
                      <EmptyState
                        icon={<FileStack className="h-6 w-6" />}
                        title="No statements yet"
                        description="Upload or manually enter vendor monthly statements to reconcile bills against supplier records and catch late fees."
                        action={
                          <Button size="sm" className="h-8" onClick={openNew}>
                            <Plus className="h-3 w-3 mr-1" /> New statement
                          </Button>
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
                <Label>Current Period Charges <span className="text-primary text-xs">(posts to P&L)</span></Label>
                <Input type="number" step="0.01" value={editing.current_period_charges ?? 0} onChange={(e) => setField("current_period_charges", e.target.value)} onBlur={recomputeClosing} />
              </div>
              <div>
                <Label>Payments / Credits</Label>
                <Input type="number" step="0.01" value={editing.payments_credits ?? 0} onChange={(e) => setField("payments_credits", e.target.value)} onBlur={recomputeClosing} />
              </div>
              <div>
                <Label>Late Fees <span className="text-primary text-xs">(posts to P&L)</span></Label>
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
