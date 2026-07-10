import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useExpenseBills, ExpenseBill, ExpenseBillAllocation } from "@/hooks/useExpenseBills";
import { useVendorStatements } from "@/hooks/useVendorStatements";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { CheckCircle2, XCircle, FileQuestion, Ban, Pencil, FileCheck2, ShieldCheck } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  PageHeader,
  StatusPill,
  StatusVariant,
  EmptyState,
  fmtHK,
  fmtDate,
} from "@/components/expenses/shared";

const DOC_VARIANT: Record<string, { label: string; variant: StatusVariant }> = {
  not_required: { label: "No document required", variant: "muted" },
  pending: { label: "Document pending", variant: "warning" },
  received: { label: "Document received", variant: "success" },
};

export default function ExpenseApprovals() {
  const { tenantId } = useActiveTenant();
  const { bills, setStatus, setDocumentRequirement, postBill, saveBill, fetchAllocations } = useExpenseBills();
  const { statements } = useVendorStatements();
  const [editBill, setEditBill] = useState<ExpenseBill | null>(null);
  const [editAllocs, setEditAllocs] = useState<ExpenseBillAllocation[]>([]);
  const [accountsByID, setAccountsByID] = useState<Record<string, { code: string; name: string }>>({});
  const [ruleNames, setRuleNames] = useState<Record<string, string>>({});

  const pending = useMemo(() => bills.filter((b) => b.approval_status === "pending_review"), [bills]);
  const pendingStmts = useMemo(() => statements.filter((s) => s.approval_status === "pending_review"), [statements]);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      // Tenant-scoped lookups (defence-in-depth beyond RLS).
      const { data: accs } = await supabase.from("chart_of_accounts").select("id,code,name").eq("tenant_id", tenantId);
      const map: Record<string, { code: string; name: string }> = {};
      (accs || []).forEach((a: any) => { map[a.id] = { code: a.code, name: a.name }; });
      setAccountsByID(map);
      const { data: rules } = await supabase.from("expense_recurring_rules").select("id,name").eq("tenant_id", tenantId);
      const rmap: Record<string, string> = {};
      (rules || []).forEach((r: any) => { rmap[r.id] = r.name; });
      setRuleNames(rmap);
    })();
  }, [tenantId]);

  const approveAndPost = async (b: ExpenseBill) => {
    const ok = await setStatus(b.id, "approved");
    if (ok) await postBill(b.id);
  };

  const openEdit = async (b: ExpenseBill) => {
    setEditBill(b);
    const allocs = await fetchAllocations(b.id);
    setEditAllocs(allocs.length ? allocs : [{
      line_no: 1, expense_category: null, account_id: null,
      venue: b.venue, department: b.department, amount: b.total_amount,
      tax_treatment: "none", tax_amount: 0, notes: null,
    }]);
  };

  const saveAndApprove = async () => {
    if (!editBill) return;
    const id = await saveBill(editBill, editAllocs);
    if (id) {
      await setStatus(id, "approved");
      await postBill(id);
      setEditBill(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Expense Approvals"
        description="Bills and statements awaiting approval. Approve & Post writes to the general ledger."
      />

      <Card className="card-glass p-0 overflow-hidden">
        <div className="p-4 border-b border-border/60 text-sm font-medium">
          Bills awaiting approval <span className="text-muted-foreground">({pending.length})</span>
        </div>
        <div className="divide-y">
          {pending.map((b) => {
            const isRecurring = b.source_type === "recurring_rule";
            const doc = DOC_VARIANT[b.document_requirement || "not_required"] || DOC_VARIANT.not_required;
            return (
              <div key={b.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{b.vendor_name || "—"}</span>
                      {isRecurring && <StatusPill variant="neutral">Recurring rule</StatusPill>}
                      {isRecurring && b.recurring_rule_id && ruleNames[b.recurring_rule_id] && (
                        <span className="text-xs text-muted-foreground">→ {ruleNames[b.recurring_rule_id]}</span>
                      )}
                      <StatusPill variant={doc.variant}>{doc.label}</StatusPill>
                      {b.combined_venues && <StatusPill variant="info">All venues / combined</StatusPill>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Bill #{b.bill_number || "—"} · Recognition {fmtDate(b.bill_date)}
                      {b.period_start && ` · Period ${fmtDate(b.period_start)} → ${fmtDate(b.period_end)}`}
                    </div>
                  </div>
                  <div className="text-right td-num text-lg font-semibold whitespace-nowrap">{fmtHK(b.total_amount)}</div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                  <div><span className="text-muted-foreground">Venue:</span> {b.venue || (b.combined_venues ? "Combined" : "—")}</div>
                  <div><span className="text-muted-foreground">Department:</span> {b.department || "—"}</div>
                  <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> {b.notes || "—"}</div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={() => approveAndPost(b)}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve & Post
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(b)}>
                    <Pencil className="h-4 w-4 mr-1" /> Edit & Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus(b.id, "rejected")}>
                    <XCircle className="h-4 w-4 mr-1" /> Reject
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDocumentRequirement(b.id, "pending")}>
                    <FileQuestion className="h-4 w-4 mr-1" /> Request Documents
                  </Button>
                  {b.document_requirement === "pending" && (
                    <Button size="sm" variant="outline" onClick={() => setDocumentRequirement(b.id, "received")}>
                      <FileCheck2 className="h-4 w-4 mr-1" /> Mark Received
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (confirm("Mark this expense as Not Applicable for this period?")) setStatus(b.id, "void");
                  }}>
                    <Ban className="h-4 w-4 mr-1" /> N/A for Period
                  </Button>
                </div>
              </div>
            );
          })}
          {!pending.length && (
            <EmptyState
              icon={<ShieldCheck className="h-6 w-6" />}
              title="Nothing awaiting your approval"
              description="Bills submitted for review from Bills & Expenses or Recurring Rules will appear here."
            />
          )}
        </div>
      </Card>

      <Card className="card-glass p-0 overflow-hidden">
        <div className="p-4 border-b border-border/60 text-sm font-medium">
          Statements awaiting approval <span className="text-muted-foreground">({pendingStmts.length})</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Statement #</TableHead>
              <TableHead className="text-right">Current Charges</TableHead>
              <TableHead className="text-right">Late Fees</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingStmts.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{fmtDate(s.statement_date)}</TableCell>
                <TableCell>{s.vendor_name || "—"}</TableCell>
                <TableCell>{s.statement_number || "—"}</TableCell>
                <TableCell className="text-right td-num tabular-nums whitespace-nowrap">{fmtHK(s.current_period_charges)}</TableCell>
                <TableCell className="text-right td-num tabular-nums whitespace-nowrap">{fmtHK(s.late_fees)}</TableCell>
              </TableRow>
            ))}
            {!pendingStmts.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No statements pending</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={!!editBill} onOpenChange={(o) => !o && setEditBill(null)}>
        <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit & Approve Bill</SheetTitle>
          </SheetHeader>
          {editBill && (
            <div className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Vendor</Label>
                  <Input value={editBill.vendor_name || ""} onChange={(e) => setEditBill({ ...editBill, vendor_name: e.target.value })} />
                </div>
                <div>
                  <Label>Bill #</Label>
                  <Input value={editBill.bill_number || ""} onChange={(e) => setEditBill({ ...editBill, bill_number: e.target.value })} />
                </div>
                <div>
                  <Label>Bill Date</Label>
                  <Input type="date" value={editBill.bill_date} onChange={(e) => setEditBill({ ...editBill, bill_date: e.target.value })} />
                </div>
                <div>
                  <Label>Total</Label>
                  <Input type="number" step="0.01" value={editBill.total_amount} onChange={(e) => {
                    const v = Number(e.target.value);
                    setEditBill({ ...editBill, total_amount: v, subtotal: v });
                    setEditAllocs((p) => p.map((a, i) => i === 0 ? { ...a, amount: v } : a));
                  }} />
                </div>
                <div className="col-span-2">
                  <Label>Notes</Label>
                  <Textarea value={editBill.notes || ""} onChange={(e) => setEditBill({ ...editBill, notes: e.target.value })} />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Allocation: {editAllocs.map((a) => `${accountsByID[a.account_id || ""]?.code || "?"} — ${fmtHK(a.amount)}`).join(", ") || "—"}
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setEditBill(null)}>Cancel</Button>
                <Button onClick={saveAndApprove}>Save & Approve</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
