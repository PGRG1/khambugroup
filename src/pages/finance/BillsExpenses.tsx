import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Search, Eye, ExternalLink, ScanLine, ShieldAlert, FileText, ArrowRight, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import BillScanner, { ScannedBill } from "@/components/finance/bills/BillScanner";
import {
  useExpenseBills,
  ExpenseBill,
  ExpenseBillAllocation,
  ExpenseBillAuditRow,
  ExpenseBillPayment,
  BillApprovalStatus,
} from "@/hooks/useExpenseBills";
import { useAuth } from "@/hooks/useAuth";
import {
  PageHeader,
  KpiGrid,
  KpiCard,
  KpiSkeleton,
  StatusPill,
  TableSkeleton,
  EmptyState,
  ScopeLine,
  approvalVariant,
  paymentVariant,
  APPROVAL_LABEL,
  PAYMENT_LABEL,
  fmtHK,
  fmtHKWhole,
  fmtDate,
} from "@/components/expenses/shared";

interface Supplier { id: string; name: string }
interface Account { id: string; code: string; name: string; account_type?: string }
interface Venue { id: string; name: string }
interface BankAccount { id: string; account_name: string }
interface Category { id: string; name: string; default_account_id: string | null }

const CATEGORY_OTHER = "__other__";

export default function BillsExpenses() {
  const { isAdmin } = useAuth();
  const { tenantId } = useActiveTenant();
  const { bills, loading, saveBill, postBill, reverseBill, recordPayment, fetchAllocations, fetchAudit, fetchPayments } = useExpenseBills();
  const location = useLocation();
  const navigate = useNavigate();
  const prefill = (location.state as any)?.prefill as
    | { header: Partial<ExpenseBill>; allocations: ExpenseBillAllocation[]; bankTxnId?: string | null }
    | undefined;
  const [linkedBankTxn, setLinkedBankTxn] = useState<string | null>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseBill | null>(null);
  const [header, setHeader] = useState<Partial<ExpenseBill>>({});
  const [allocations, setAllocations] = useState<ExpenseBillAllocation[]>([]);
  const [audit, setAudit] = useState<ExpenseBillAuditRow[]>([]);
  const [payments, setPayments] = useState<ExpenseBillPayment[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);

  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payForm, setPayForm] = useState<{ amount: string; payment_date: string; payment_method: string; bank_account_id: string; reference: string }>({
    amount: "",
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: "bank_transfer",
    bank_account_id: "",
    reference: "",
  });

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      // All lookups tenant-scoped server-side (defence-in-depth beyond RLS).
      const [s, a, v, b, c] = await Promise.all([
        supabase.from("suppliers").select("id,name").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
        supabase.from("chart_of_accounts").select("id,code,name,account_type").eq("tenant_id", tenantId).order("code"),
        supabase.from("venues").select("id,name").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
        supabase.from("bank_accounts").select("id,account_name").eq("tenant_id", tenantId).order("account_name"),
        supabase.from("expense_categories").select("id,name,default_account_id").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
      ]);
      setSuppliers((s.data || []) as Supplier[]);
      setAccounts((a.data || []) as Account[]);
      setVenues((v.data || []) as Venue[]);
      setBankAccounts((b.data || []) as BankAccount[]);
      setCategories((c.data || []) as Category[]);
    })();
  }, [tenantId]);

  // Pre-fill from another page (e.g. bank-detected expense) — open editor with hint.
  useEffect(() => {
    if (!prefill) return;
    setEditing(null);
    setHeader({
      bill_date: new Date().toISOString().slice(0, 10),
      currency: "HKD",
      subtotal: 0,
      tax_amount: 0,
      total_amount: 0,
      approval_status: "draft",
      ...prefill.header,
    });
    setAllocations(prefill.allocations.length
      ? prefill.allocations
      : [{ line_no: 1, expense_category: null, account_id: null, venue: null, department: null, amount: Number(prefill.header?.subtotal || prefill.header?.total_amount || 0), tax_treatment: "none", tax_amount: 0, notes: null }]);
    setAudit([]);
    setPayments([]);
    setLinkedBankTxn(prefill.bankTxnId || null);
    setEditorOpen(true);
    // Clear location.state so a refresh doesn't re-open the editor.
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const supplierName = (id: string | null) =>
    suppliers.find((s) => s.id === id)?.name || "—";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bills.filter((b) => {
      if (statusFilter !== "all" && b.approval_status !== statusFilter) return false;
      if (paymentFilter !== "all" && b.payment_status !== paymentFilter) return false;
      if (!q) return true;
      const v = supplierName(b.supplier_id) + " " + (b.vendor_name || "") + " " + (b.bill_number || "") + " " + (b.notes || "");
      return v.toLowerCase().includes(q);
    });
  }, [bills, search, statusFilter, paymentFilter, suppliers]);

  // KPIs
  const kpis = useMemo(() => {
    const today = new Date();
    const in7 = new Date(today.getTime() + 7 * 86400000);
    let outstanding = 0, overdue = 0, dueSoon = 0, postedMtd = 0;
    const mtd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    bills.forEach((b) => {
      const owed = b.total_amount - b.paid_amount;
      if (b.payment_status !== "paid" && b.approval_status !== "void") {
        outstanding += owed;
        if (b.due_date) {
          const d = new Date(b.due_date);
          if (d < today) overdue += owed;
          else if (d <= in7) dueSoon += owed;
        }
      }
      if (b.approval_status === "posted" && (b.posted_at || b.bill_date).startsWith(mtd)) postedMtd += b.total_amount;
    });
    return { outstanding, overdue, dueSoon, postedMtd };
  }, [bills]);

  const openEditor = async (bill: ExpenseBill | null) => {
    setEditing(bill);
    if (bill) {
      setHeader({ ...bill });
      const [allocs, aud, pay] = await Promise.all([
        fetchAllocations(bill.id),
        fetchAudit(bill.id),
        fetchPayments(bill.id),
      ]);
      setAllocations(allocs.length ? allocs : []);
      setAudit(aud);
      setPayments(pay);
    } else {
      setHeader({
        bill_date: new Date().toISOString().slice(0, 10),
        currency: "HKD",
        subtotal: 0,
        tax_amount: 0,
        total_amount: 0,
        approval_status: "draft",
      });
      setAllocations([{ line_no: 1, expense_category: "", account_id: null, venue: null, department: null, amount: 0, tax_treatment: "none", tax_amount: 0, notes: null }]);
      setAudit([]);
      setPayments([]);
    }
    setEditorOpen(true);
  };

  const addAllocation = () => {
    setAllocations((rows) => [...rows, { line_no: rows.length + 1, expense_category: "", account_id: null, venue: header.venue || null, department: header.department || null, amount: 0, tax_treatment: "none", tax_amount: 0, notes: null }]);
  };

  const updateAlloc = (idx: number, patch: Partial<ExpenseBillAllocation>) => {
    setAllocations((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeAlloc = (idx: number) => {
    setAllocations((rows) => rows.filter((_, i) => i !== idx));
  };

  const handleScanned = (s: ScannedBill) => {
    // Try to match supplier by name (case-insensitive)
    const matched = suppliers.find((sp) => sp.name.toLowerCase() === s.vendor_name.toLowerCase());
    const ven = venues.find((v) => v.name.toLowerCase() === (s.venue || "").toLowerCase());
    setEditing(null);
    setHeader({
      supplier_id: matched?.id || null,
      vendor_name: s.vendor_name || null,
      bill_number: s.bill_number || null,
      bill_date: s.bill_date || new Date().toISOString().slice(0, 10),
      due_date: s.due_date || null,
      service_period_start: s.service_period_start || null,
      service_period_end: s.service_period_end || null,
      venue: ven?.name || s.venue || null,
      venue_id: ven?.id || null,
      currency: s.currency || "HKD",
      subtotal: s.subtotal || 0,
      tax_amount: s.tax_amount || 0,
      total_amount: s.total_amount || (s.subtotal + s.tax_amount),
      notes: s.notes || null,
      attachment_url: s.attachment_url || null,
      attachment_path: s.attachment_path || null,
      approval_status: "draft",
    });
    setAllocations(
      (s.allocations.length ? s.allocations : [{ expense_category: "Other Operating Expenses", amount: s.subtotal || s.total_amount, notes: "" }]).map((a, i) => ({
        line_no: i + 1,
        expense_category: a.expense_category,
        account_id: null,
        venue: ven?.name || s.venue || null,
        department: null,
        amount: a.amount,
        tax_treatment: "none",
        tax_amount: 0,
        notes: a.notes || null,
      }))
    );
    setAudit([]);
    setPayments([]);
    setEditorOpen(true);
  };

  const allocTotal = allocations.reduce((s, a) => s + Number(a.amount || 0), 0);
  const expectedAllocTotal = Number(header.subtotal || 0) || (Number(header.total_amount || 0) - Number(header.tax_amount || 0));
  const balanced = Math.abs(allocTotal - expectedAllocTotal) < 0.01;

  const handleSave = async (newStatus?: BillApprovalStatus) => {
    const payload: Partial<ExpenseBill> = { ...header };
    if (newStatus) payload.approval_status = newStatus;
    const id = await saveBill(payload, allocations);
    if (id && linkedBankTxn && tenantId) {
      // Link the originating bank transaction so it stops appearing as "unposted".
      await supabase
        .from("bank_transactions")
        .update({ expense_posted_bill_id: id })
        .eq("id", linkedBankTxn)
        .eq("tenant_id", tenantId);
      setLinkedBankTxn(null);
    }
    if (id && !editing) {
      setEditorOpen(false);
    } else if (id) {
      const [aud, pay] = await Promise.all([fetchAudit(id), fetchPayments(id)]);
      setAudit(aud);
      setPayments(pay);
    }
  };

  const handlePost = async () => {
    if (!editing) return;
    if (!balanced) return;
    const ok = await postBill(editing.id);
    if (ok) {
      const aud = await fetchAudit(editing.id);
      setAudit(aud);
      setEditing({ ...editing, approval_status: "posted" });
      setHeader((h) => ({ ...h, approval_status: "posted" }));
    }
  };

  const handleRecordPayment = async () => {
    if (!editing) return;
    const amt = parseFloat(payForm.amount);
    if (!amt || amt <= 0) return;
    const ok = await recordPayment({
      bill_id: editing.id,
      payment_date: payForm.payment_date,
      amount: amt,
      payment_method: payForm.payment_method,
      bank_account_id: payForm.bank_account_id || null,
      reference: payForm.reference || null,
      notes: null,
    });
    if (ok) {
      setPayDialogOpen(false);
      setPayForm({ ...payForm, amount: "", reference: "" });
      const [aud, pay] = await Promise.all([fetchAudit(editing.id), fetchPayments(editing.id)]);
      setAudit(aud);
      setPayments(pay);
    }
  };

  // Alert reviewers on the editor when the current bill has allocations missing GL
  // accounts — bills like these silently stall at Post because the RPC rejects them.
  const hasUnmappedAllocation = allocations.some((a) => !a.account_id);

  const masterMissing = categories.length === 0 || suppliers.length === 0;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Bills & Expenses"
        description="Non-inventory supplier bills — utilities, rent, services, professional fees, late charges."
        actions={
          <>
            <Button size="sm" variant="outline" className="h-9" onClick={() => setScannerOpen(true)}>
              <ScanLine className="h-4 w-4 mr-1" /> Scan bill
            </Button>
            <Button size="sm" className="h-9" onClick={() => openEditor(null)}>
              <Plus className="h-4 w-4 mr-1" /> New bill
            </Button>
          </>
        }
      />

      {/* Master-data prompt — surfaces when categories or vendors are empty. */}
      {masterMissing && (
        <div className="card-glass rounded-xl border border-warning/40 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-warning/10 p-2 text-warning shrink-0">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Set up master data first</div>
              <p className="text-xs text-muted-foreground mt-1">
                {categories.length === 0 && "No expense categories exist yet. "}
                {suppliers.length === 0 && "No active vendors exist yet. "}
                Bills entered without master data become orphaned records that won't flow into P&amp;L correctly.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {categories.length === 0 && (
                  <Link to="/expenses/categories"><Button size="sm" className="h-8">Add categories <ArrowRight className="h-3 w-3 ml-1" /></Button></Link>
                )}
                {suppliers.length === 0 && (
                  <Link to="/expenses/vendors"><Button size="sm" className="h-8">Add vendors <ArrowRight className="h-3 w-3 ml-1" /></Button></Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && bills.length === 0 ? (
        <KpiSkeleton count={4} />
      ) : (
        <KpiGrid>
          <KpiCard label="Total outstanding" value={fmtHKWhole(kpis.outstanding)} tone={kpis.outstanding > 0 ? "warning" : "default"} />
          <KpiCard label="Overdue" value={fmtHKWhole(kpis.overdue)} tone={kpis.overdue > 0 ? "destructive" : "default"} />
          <KpiCard label="Due in 7 days" value={fmtHKWhole(kpis.dueSoon)} tone={kpis.dueSoon > 0 ? "warning" : "default"} />
          <KpiCard label="Posted MTD" value={fmtHKWhole(kpis.postedMtd)} tone="info" />
        </KpiGrid>
      )}

      <Card className="card-glass p-0 overflow-hidden">
        <div className="p-4 border-b border-border/60">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search vendor, bill #, notes…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Approval status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All approval</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_review">Pending review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Payment" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payment</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ScopeLine>
            <span className="mt-2 inline-block">
              Showing {filtered.length} of {bills.length} bill{bills.length === 1 ? "" : "s"}
              {statusFilter !== "all" && ` · approval: ${statusFilter}`}
              {paymentFilter !== "all" && ` · payment: ${paymentFilter}`}
            </span>
          </ScopeLine>
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={11} />
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Vendor</TableHead>
                  <TableHead>Bill #</TableHead>
                  <TableHead>Bill date</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="p-0">
                      <EmptyState
                        icon={<FileText className="h-6 w-6" />}
                        title={bills.length === 0 ? "No bills yet" : "No bills match the current filter"}
                        description={bills.length === 0 ? "Scan a bill or create one manually to start tracking expenses." : "Try clearing the search or status filters."}
                        action={bills.length === 0 ? (
                          <Button size="sm" className="h-8" onClick={() => openEditor(null)}>
                            <Plus className="h-3 w-3 mr-1" /> Create first bill
                          </Button>
                        ) : undefined}
                      />
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((b) => (
                  <TableRow key={b.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openEditor(b)}>
                    <TableCell>{supplierName(b.supplier_id) !== "—" ? supplierName(b.supplier_id) : b.vendor_name || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-xs">{b.bill_number || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(b.bill_date)}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(b.due_date)}</TableCell>
                    <TableCell>{b.venue || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{b.department || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right td-num tabular-nums whitespace-nowrap">{fmtHK(b.total_amount)}</TableCell>
                    <TableCell className="text-right td-num tabular-nums whitespace-nowrap text-muted-foreground">{fmtHK(b.paid_amount)}</TableCell>
                    <TableCell><StatusPill variant={approvalVariant(b.approval_status)}>{APPROVAL_LABEL[b.approval_status] || b.approval_status}</StatusPill></TableCell>
                    <TableCell><StatusPill variant={paymentVariant(b.payment_status)}>{PAYMENT_LABEL[b.payment_status] || b.payment_status}</StatusPill></TableCell>
                    <TableCell><Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>


      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent className="w-full sm:max-w-4xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? `Bill ${editing.bill_number || ""}` : "New Bill"}</SheetTitle>
          </SheetHeader>

          <div className="space-y-6 mt-4">
            {/* Header form */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <Label>Vendor</Label>
                <Select value={header.supplier_id || ""} onValueChange={(v) => setHeader({ ...header, supplier_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.filter(s => s.id).map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Vendor name (override)</Label>
                <Input value={header.vendor_name || ""} onChange={(e) => setHeader({ ...header, vendor_name: e.target.value })} placeholder="Optional" />
              </div>
              <div>
                <Label>Bill / Invoice #</Label>
                <Input value={header.bill_number || ""} onChange={(e) => setHeader({ ...header, bill_number: e.target.value })} />
              </div>
              <div>
                <Label>Bill date</Label>
                <Input type="date" value={header.bill_date || ""} onChange={(e) => setHeader({ ...header, bill_date: e.target.value })} />
              </div>
              <div>
                <Label>Due date</Label>
                <Input type="date" value={header.due_date || ""} onChange={(e) => setHeader({ ...header, due_date: e.target.value })} />
              </div>
              <div>
                <Label>Currency</Label>
                <Input value={header.currency || "HKD"} onChange={(e) => setHeader({ ...header, currency: e.target.value })} />
              </div>
              <div>
                <Label>Service period start</Label>
                <Input type="date" value={header.service_period_start || ""} onChange={(e) => setHeader({ ...header, service_period_start: e.target.value })} />
              </div>
              <div>
                <Label>Service period end</Label>
                <Input type="date" value={header.service_period_end || ""} onChange={(e) => setHeader({ ...header, service_period_end: e.target.value })} />
              </div>
              <div>
                <Label>Venue / Outlet</Label>
                <Select value={header.venue || ""} onValueChange={(v) => {
                  const ven = venues.find(x => x.name === v);
                  setHeader({ ...header, venue: v, venue_id: ven?.id || null });
                }}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {venues.filter(v => v.name).map((v) => (<SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Department</Label>
                <Input value={header.department || ""} onChange={(e) => setHeader({ ...header, department: e.target.value })} />
              </div>
              <div>
                <Label>Subtotal</Label>
                <Input type="number" step="0.01" value={header.subtotal ?? 0} onChange={(e) => {
                  const sub = parseFloat(e.target.value) || 0;
                  const tax = Number(header.tax_amount || 0);
                  setHeader({ ...header, subtotal: sub, total_amount: sub + tax });
                }} />
              </div>
              <div>
                <Label>Tax amount</Label>
                <Input type="number" step="0.01" value={header.tax_amount ?? 0} onChange={(e) => {
                  const tax = parseFloat(e.target.value) || 0;
                  const sub = Number(header.subtotal || 0);
                  setHeader({ ...header, tax_amount: tax, total_amount: sub + tax });
                }} />
              </div>
              <div>
                <Label>Total amount</Label>
                <Input type="number" step="0.01" value={header.total_amount ?? 0} onChange={(e) => setHeader({ ...header, total_amount: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={header.notes || ""} onChange={(e) => setHeader({ ...header, notes: e.target.value })} rows={2} />
            </div>

            {header.attachment_url && (
              <div className="text-sm">
                <a href={header.attachment_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> View attachment
                </a>
              </div>
            )}

            {/* Allocations */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">Expense Allocation</h3>
                <Button size="sm" variant="outline" onClick={addAllocation}><Plus className="h-3 w-3 mr-1" /> Add row</Button>
              </div>
              <div className="border rounded-md overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-44">Category</TableHead>
                      <TableHead className="w-56">Account</TableHead>
                      <TableHead className="w-32">Venue</TableHead>
                      <TableHead className="w-32">Department</TableHead>
                      <TableHead className="w-28 text-right">Amount</TableHead>
                      <TableHead className="w-28">Tax</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocations.map((a, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          {(() => {
                            // Match the free-text category against the master list
                            // (case-insensitive), so scanner output like "Laundry" that
                            // exactly matches a master row shows in the Select. Anything
                            // that doesn't match falls into an "Other (typed)" option
                            // that reveals a small free-text input — this is the guarded
                            // migration path away from unlinked free-text categories.
                            const matched = categories.find(
                              (c) => c.name.toLowerCase() === (a.expense_category || "").toLowerCase()
                            );
                            const selectValue = matched ? matched.id : (a.expense_category ? CATEGORY_OTHER : "");
                            return (
                              <div className="space-y-1">
                                <Select
                                  value={selectValue}
                                  onValueChange={(v) => {
                                    if (v === CATEGORY_OTHER) {
                                      updateAlloc(idx, { expense_category: a.expense_category || "" });
                                    } else {
                                      const cat = categories.find((c) => c.id === v);
                                      updateAlloc(idx, {
                                        expense_category: cat?.name || null,
                                        // Auto-fill GL account from category default when
                                        // the row hasn't picked one yet — this is what
                                        // unblocks bills from stalling in Pending Review.
                                        account_id: a.account_id || cat?.default_account_id || null,
                                      });
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-8"><SelectValue placeholder="Select category" /></SelectTrigger>
                                  <SelectContent>
                                    {categories.map((c) => (
                                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                    <SelectItem value={CATEGORY_OTHER}>Other (typed)</SelectItem>
                                  </SelectContent>
                                </Select>
                                {(selectValue === CATEGORY_OTHER || (!matched && a.expense_category)) && (
                                  <Input
                                    className="h-8 text-xs"
                                    value={a.expense_category || ""}
                                    onChange={(e) => updateAlloc(idx, { expense_category: e.target.value })}
                                    placeholder="Custom label"
                                  />
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <Select value={a.account_id || ""} onValueChange={(v) => updateAlloc(idx, { account_id: v })}>
                            <SelectTrigger><SelectValue placeholder="GL account" /></SelectTrigger>
                            <SelectContent>
                              {accounts.filter(ac => ac.id).map((ac) => (
                                <SelectItem key={ac.id} value={ac.id}>{ac.code} — {ac.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select value={a.venue || ""} onValueChange={(v) => updateAlloc(idx, { venue: v })}>
                            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              {venues.filter(v => v.name).map(v => (<SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input value={a.department || ""} onChange={(e) => updateAlloc(idx, { department: e.target.value })} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input type="number" step="0.01" value={a.amount} onChange={(e) => updateAlloc(idx, { amount: parseFloat(e.target.value) || 0 })} className="text-right font-mono" />
                        </TableCell>
                        <TableCell>
                          <Select value={a.tax_treatment} onValueChange={(v: any) => updateAlloc(idx, { tax_treatment: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="inclusive">Inclusive</SelectItem>
                              <SelectItem value="exclusive">Exclusive</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input value={a.notes || ""} onChange={(e) => updateAlloc(idx, { notes: e.target.value })} placeholder="Optional" />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeAlloc(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className={`mt-2 flex justify-end text-sm font-mono ${balanced ? "text-primary" : "text-destructive"}`}>
                Allocation total: {fmtHK(allocTotal)} / Expected: {fmtHK(expectedAllocTotal)}
                {!balanced && <span className="ml-2 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> unbalanced</span>}
              </div>
              {hasUnmappedAllocation && (
                <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium">One or more allocation lines are missing a GL account.</div>
                    <div className="mt-0.5 text-muted-foreground">
                      Pick a category with a default account, or set an account explicitly.
                      Posting to GL is blocked until every line is mapped.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Payments */}
            {editing && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">Payments</h3>
                  {editing.approval_status === "posted" && editing.payment_status !== "paid" && isAdmin && (
                    <Button size="sm" variant="outline" onClick={() => {
                      setPayForm({ ...payForm, amount: String(editing.total_amount - editing.paid_amount) });
                      setPayDialogOpen(true);
                    }}>Record Payment</Button>
                  )}
                </div>
                {payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Date</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p) => (
                        <TableRow key={p.id}><TableCell>{fmtDate(p.payment_date)}</TableCell><TableCell>{p.payment_method}</TableCell><TableCell>{p.reference || "—"}</TableCell><TableCell className="text-right td-num tabular-nums whitespace-nowrap">{fmtHK(p.amount)}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}

            {/* Audit trail */}
            {editing && audit.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Audit trail</h3>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {audit.map((row) => (
                    <div key={row.id} className="flex gap-2">
                      <span className="font-mono">{new Date(row.created_at).toLocaleString()}</span>
                      <StatusPill variant="neutral">{row.event_type}</StatusPill>
                      <span>{row.actor_name || row.actor_id?.slice(0, 8) || "system"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => handleSave()}>Save Draft</Button>
              {header.approval_status === "draft" && (
                <Button variant="outline" onClick={() => handleSave("pending_review")}>Submit for Review</Button>
              )}
              {header.approval_status === "pending_review" && isAdmin && (
                <>
                  <Button variant="outline" onClick={() => handleSave("approved")}>Approve</Button>
                  <Button variant="outline" onClick={() => handleSave("rejected")}>Reject</Button>
                </>
              )}
              {(header.approval_status === "approved" || header.approval_status === "pending_review") && isAdmin && editing && (
                <Button
                  onClick={handlePost}
                  disabled={!balanced || hasUnmappedAllocation}
                  title={hasUnmappedAllocation ? "Every allocation line needs a GL account." : (!balanced ? "Allocation totals must balance." : undefined)}
                >
                  Approve &amp; Post to GL
                </Button>
              )}
              {editing && editing.approval_status !== "void" && isAdmin && (
                <Button variant="ghost" className="text-destructive ml-auto" onClick={() => handleSave("void")}>Void</Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Payment dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Payment date</Label>
              <Input type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} />
            </div>
            <div>
              <Label>Amount</Label>
              <Input type="number" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
            </div>
            <div>
              <Label>Method</Label>
              <Select value={payForm.payment_method} onValueChange={(v) => setPayForm({ ...payForm, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="autopay">Autopay</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {payForm.payment_method !== "cash" && (
              <div>
                <Label>Bank account</Label>
                <Select value={payForm.bank_account_id} onValueChange={(v) => setPayForm({ ...payForm, bank_account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.filter(b => b.id).map((b) => (<SelectItem key={b.id} value={b.id}>{b.account_name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Reference</Label>
              <Input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRecordPayment}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BillScanner open={scannerOpen} onOpenChange={setScannerOpen} onParsed={handleScanned} />
    </div>
  );
}
