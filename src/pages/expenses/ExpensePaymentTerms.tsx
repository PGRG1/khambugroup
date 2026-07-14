import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Clock, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { toast } from "sonner";
import {
  PageHeader,
  StatusPill,
  TableSkeleton,
  EmptyState,
  KpiGrid,
  KpiCard,
  KpiSkeleton,
  ScopeLine,
  useConfirm,
} from "@/components/expenses/shared";

interface PaymentTerm {
  id: string;
  name: string;
  days: number;
  description: string | null;
  is_active: boolean;
}

export default function ExpensePaymentTermsPage() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [rows, setRows] = useState<PaymentTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<PaymentTerm>>({});
  const [search, setSearch] = useState("");

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("expense_payment_terms")
      .select("id,name,days,description,is_active")
      .eq("tenant_id", tenantId)
      .order("days");
    if (error) { toast.error(error.message); setLoading(false); return; }
    setRows((data || []) as any);
    setLoading(false);
  };

  useEffect(() => {
    if (!tenantLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, tenantLoading]);

  const save = async () => {
    if (!editing.name) { toast.error("Name is required"); return; }
    if (editing.days == null || editing.days < 0) { toast.error("Days must be 0 or more"); return; }
    const payload: any = {
      name: editing.name,
      days: editing.days,
      description: editing.description || null,
      is_active: editing.is_active ?? true,
    };
    if (editing.id) {
      const { error } = await supabase.from("expense_payment_terms").update(payload).eq("id", editing.id).eq("tenant_id", tenantId!);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase
        .from("expense_payment_terms")
        .insert({ ...payload, tenant_id: tenantId } as any);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Saved");
    setOpen(false);
    load();
  };

  const toggleActive = async (r: PaymentTerm) => {
    const { error } = await supabase
      .from("expense_payment_terms")
      .update({ is_active: !r.is_active })
      .eq("id", r.id)
      .eq("tenant_id", tenantId!);
    if (error) toast.error(error.message);
    else load();
  };

  const remove = async (r: PaymentTerm) => {
    const { count, error: cErr } = await supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("payment_terms_id", r.id);
    if (cErr) { toast.error(cErr.message); return; }
    if ((count ?? 0) > 0) {
      toast.error(`This payment term is used by ${count} vendor${count === 1 ? "" : "s"} and cannot be deleted.`);
      return;
    }
    if (!confirm(`Delete "${r.name}"?`)) return;
    const { error } = await supabase.from("expense_payment_terms").delete().eq("id", r.id).eq("tenant_id", tenantId!);
    if (error) toast.error(error.message);
    else load();
  };

  const openNew = () => {
    setEditing({ days: 30, is_active: true });
    setOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Payment Terms"
        description="Standard net-day terms assigned to vendors and applied to bills for due-date defaults."
        actions={
          <Button size="sm" className="h-9" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Add payment term
          </Button>
        }
      />

      {(() => {
        const active = rows.filter((r) => r.is_active).length;
        const avgDays = rows.length ? Math.round(rows.reduce((s, r) => s + r.days, 0) / rows.length) : 0;
        return loading && rows.length === 0 ? (
          <KpiSkeleton count={3} />
        ) : (
          <KpiGrid>
            <KpiCard label="Payment terms" value={String(rows.length)} />
            <KpiCard label="Active" value={String(active)} tone={active > 0 ? "success" : "default"} />
            <KpiCard label="Avg net days" value={String(avgDays)} hint="Across all terms" tone="info" />
          </KpiGrid>
        );
      })()}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder="Search name or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(() => {
          const q = search.trim().toLowerCase();
          const shown = q ? rows.filter((r) => (r.name + " " + (r.description || "")).toLowerCase().includes(q)) : rows;
          return <ScopeLine>Showing {shown.length} of {rows.length}</ScopeLine>;
        })()}
      </div>

      <Card className="card-glass p-0 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Name</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground text-right">Days</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Description</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(search.trim() ? rows.filter((r) => (r.name + " " + (r.description || "")).toLowerCase().includes(search.trim().toLowerCase())) : rows).map((r, idx) => (
                  <TableRow key={r.id} className={`${idx % 2 === 0 ? "bg-muted/20" : ""} hover:bg-muted/40`}>
                    <TableCell className="py-2 px-3 font-medium">{r.name}</TableCell>
                    <TableCell className="py-2 px-3 text-right td-num tabular-nums whitespace-nowrap">{r.days} days</TableCell>
                    <TableCell className="py-2 px-3 text-muted-foreground max-w-[320px] truncate">{r.description || "—"}</TableCell>
                    <TableCell className="py-2 px-3" onClick={() => toggleActive(r)}>
                      <StatusPill variant={r.is_active ? "success" : "muted"} className="cursor-pointer">
                        {r.is_active ? "Active" : "Inactive"}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="py-2 px-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(r)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <EmptyState
                        icon={<Clock className="h-6 w-6" />}
                        title="No payment terms yet"
                        description="Define your standard terms (Net 15, Net 30, Due on Receipt) so bill due dates calculate automatically from the bill date."
                        action={
                          <Button size="sm" className="h-8" onClick={openNew}>
                            <Plus className="h-3 w-3 mr-1" /> Add first term
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>{editing.id ? "Edit" : "New"} Payment Term</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input
                placeholder="e.g. Net 30"
                value={editing.name || ""}
                onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Days *</Label>
              <Input
                type="number"
                min={0}
                value={editing.days ?? ""}
                onChange={(e) => setEditing((p) => ({ ...p, days: e.target.value === "" ? undefined : Number(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Days added to the bill date to compute the due date.
              </p>
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={editing.description || ""}
                onChange={(e) => setEditing((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <Label className="text-sm">Active</Label>
              <Switch
                checked={editing.is_active ?? true}
                onCheckedChange={(v) => setEditing((p) => ({ ...p, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
