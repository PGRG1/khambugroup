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
import { Plus, Trash2, Search, Eye, ExternalLink, ShieldAlert, FileText, ArrowRight, AlertTriangle, Settings2, CheckCircle2, UserPlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { VenueSplitEditor, saveVenueSplit, SplitLine } from "@/components/allocation/VenueSplitEditor";
import { toast } from "sonner";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import BillDropZone, { ScannedBill } from "@/components/finance/bills/BillDropZone";
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
  FormSection,
  StatusFlow,
  useConfirm,
} from "@/components/expenses/shared";

interface Supplier { id: string; name: string; account_number?: string | null; vendor_type?: string | null }
interface Account { id: string; code: string; name: string; account_type?: string }
interface Venue { id: string; name: string }
interface BankAccount { id: string; account_name: string }
interface Category { id: string; name: string; default_account_id: string | null }

const CATEGORY_OTHER = "__other__";

function AmountCell({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string>(String(value ?? 0));
  useEffect(() => { if (!focused) setDraft(String(value ?? 0)); }, [value, focused]);
  const formatted = (Number(value) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">HK$</span>
      <Input
        inputMode="decimal"
        value={focused ? draft : formatted}
        onFocus={() => { setDraft(String(value ?? 0)); setFocused(true); }}
        onBlur={() => { const n = parseFloat(draft.replace(/,/g, "")); onChange(Number.isFinite(n) ? n : 0); setFocused(false); }}
        onChange={(e) => setDraft(e.target.value)}
        className="h-9 pl-11 pr-2 text-right tabular-nums font-medium"
      />
    </div>
  );
}

export default function BillsExpenses() {
  const { isAdmin } = useAuth();
  const { tenantId } = useActiveTenant();
  const { bills, loading, saveBill, postBill, reverseBill, recordPayment, fetchAllocations, fetchAudit, fetchPayments } = useExpenseBills();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const location = useLocation();
  const navigate = useNavigate();
  const prefill = (location.state as any)?.prefill as
    | { header: Partial<ExpenseBill>; allocations: ExpenseBillAllocation[]; bankTxnId?: string | null }
    | undefined;
  const [linkedBankTxn, setLinkedBankTxn] = useState<string | null>(null);

  const ALLOC_COLS_KEY = "bani.expense-alloc.columns";
  const [allocColPrefs, setAllocColPrefs] = useState<{ department: boolean; tax: boolean }>(() => {
    try {
      const raw = localStorage.getItem(ALLOC_COLS_KEY);
      if (raw) { const p = JSON.parse(raw); return { department: !!p.department, tax: !!p.tax }; }
    } catch {}
    return { department: false, tax: false };
  });
  useEffect(() => {
    try { localStorage.setItem(ALLOC_COLS_KEY, JSON.stringify(allocColPrefs)); } catch {}
  }, [allocColPrefs]);

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
  const [splitDraft, setSplitDraft] = useState<{ mode: "single" | "split"; lines: SplitLine[]; balanced: boolean }>({ mode: "single", lines: [], balanced: true });
  const [allocations, setAllocations] = useState<ExpenseBillAllocation[]>([]);
  const [audit, setAudit] = useState<ExpenseBillAuditRow[]>([]);
  const [payments, setPayments] = useState<ExpenseBillPayment[]>([]);
  

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
        supabase.from("suppliers").select("id,name,account_number,vendor_type").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
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
    // Match supplier by trimmed case-insensitive name, then fall back to account_number.
    const vName = (s.vendor_name || "").trim().toLowerCase();
    const nameMatches = suppliers.filter(
      (sp) => (sp.vendor_type || "expense") === "expense" && sp.name.trim().toLowerCase() === vName
    );
    let matched: Supplier | undefined = nameMatches.length === 1 ? nameMatches[0] : undefined;
    if (!matched && s.account_number) {
      const acct = String(s.account_number).trim().toLowerCase();
      const acctMatches = suppliers.filter(
        (sp) =>
          (sp.vendor_type || "expense") === "expense" &&
          (sp.account_number || "").trim().toLowerCase() === acct
      );
      if (acctMatches.length === 1) matched = acctMatches[0];
    }
    const ven = venues.find((v) => v.name.toLowerCase() === (s.venue || "").toLowerCase());
    const bf = Number(s.brought_forward || 0);
    const stTotal =
      s.statement_total === null || s.statement_total === undefined ? null : Number(s.statement_total);
    const meta: Record<string, any> = {};
    if (s.account_number) meta.account_number = s.account_number;
    if (s.consumption) meta.consumption = s.consumption;
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
      brought_forward: bf,
      statement_total: stTotal,
      meta,
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

  // Readiness checklist — mirrors the DB trigger (trg_expense_bill_approval_gate)
  // so users see up-front what would block approval. The DB is authoritative;
  // this is guidance only. Approve/Submit buttons stay enabled either way.
  const vendorLinked = !!header.supplier_id;
  const allocationsHaveCategory = allocations.length > 0 && allocations.every((a) => (a.expense_category || "").trim() !== "");
  const allocationsHaveAccount = allocations.length > 0 && allocations.every((a) => !!a.account_id);
  // `balanced` and `expectedAllocTotal` are computed below; recompute here for clarity.
  const _allocTotal = allocations.reduce((s, a) => s + Number(a.amount || 0), 0);
  const _expected = Number(header.subtotal || 0) || (Number(header.total_amount || 0) - Number(header.tax_amount || 0));
  const allocationsBalance = allocations.length > 0 && Math.abs(_allocTotal - _expected) < 0.01;
  const grandfatheredVendor =
    editing?.approval_status === "approved" && !editing?.supplier_id;

  // Inline vendor match: does the typed vendor_name resolve to an existing supplier?
  const trimmedVName = (header.vendor_name || "").trim();
  const vendorNameMatchExists = trimmedVName
    ? suppliers.some(
        (s) =>
          (s.vendor_type || "expense") === "expense" &&
          s.name.trim().toLowerCase() === trimmedVName.toLowerCase()
      )
    : false;
  const showInlineCreateVendor =
    !!trimmedVName && !header.supplier_id && !vendorNameMatchExists && !!tenantId;
  const [creatingVendor, setCreatingVendor] = useState(false);

  const createVendorInline = async () => {
    if (!tenantId || !trimmedVName || creatingVendor) return;
    setCreatingVendor(true);
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .insert({
          name: trimmedVName,
          vendor_type: "expense",
          is_active: true,
          tenant_id: tenantId,
          invoice_rounding_mode: "sum_then_round",
          categories: [],
          delivery_days: [],
          moq: 0,
        })
        .select("id,name,account_number,vendor_type")
        .single();
      if (error) throw error;
      const newSupplier = data as Supplier;
      setSuppliers((prev) => [...prev, newSupplier].sort((a, b) => a.name.localeCompare(b.name)));
      setHeader((h) => ({ ...h, supplier_id: newSupplier.id }));
      toast.success(`Vendor "${newSupplier.name}" added to master data`);
    } catch (e: any) {
      toast.error("Could not create vendor: " + (e?.message || "unknown error"));
    } finally {
      setCreatingVendor(false);
    }
  };

  const masterMissing = categories.length === 0 || suppliers.length === 0;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Bills & Expenses"
        description="Non-inventory supplier bills — utilities, rent, services, professional fees, late charges."
        actions={
          <Button size="sm" className="h-9" onClick={() => openEditor(null)}>
            <Plus className="h-4 w-4 mr-1" /> New bill
          </Button>
        }
      />

      <BillDropZone onParsed={handleScanned} />


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
          <SheetHeader className="pr-8">
            <div className="flex items-center gap-3 flex-wrap">
              <SheetTitle className="text-lg">
                {editing ? (editing.bill_number ? `Bill · ${editing.bill_number}` : "Bill") : "New Bill"}
              </SheetTitle>
              {editing && (
                <>
                  <StatusPill variant={approvalVariant(editing.approval_status)}>
                    {APPROVAL_LABEL[editing.approval_status] || editing.approval_status}
                  </StatusPill>
                  <StatusPill variant={paymentVariant(editing.payment_status)}>
                    {PAYMENT_LABEL[editing.payment_status] || editing.payment_status}
                  </StatusPill>
                </>
              )}
            </div>
            {editing && (
              <p className="text-xs text-muted-foreground mt-1">
                {editing.vendor_name || supplierName(editing.supplier_id)} · Bill date {fmtDate(editing.bill_date)}
                {editing.due_date && ` · Due ${fmtDate(editing.due_date)}`}
              </p>
            )}
          </SheetHeader>

          <div className="space-y-5 mt-5">
            {/* Workflow pipeline — visible on every bill so users see where it stands. */}
            {editing && (() => {
              const status = editing.approval_status;
              const paid = editing.payment_status === "paid";
              const steps = ["Draft", "Pending review", "Approved", "Posted", "Paid"];
              let idx = 0;
              if (status === "pending_review") idx = 1;
              else if (status === "approved") idx = 2;
              else if (status === "posted") idx = paid ? 4 : 3;
              if (status === "reversed" || status === "void" || status === "rejected") {
                return (
                  <StatusFlow
                    steps={steps}
                    currentIndex={0}
                    terminal={{
                      label:
                        status === "reversed"
                          ? "Reversed"
                          : status === "void"
                          ? "Void"
                          : "Rejected",
                      variant: status === "void" ? "muted" : "destructive",
                    }}
                  />
                );
              }
              return <StatusFlow steps={steps} currentIndex={idx} />;
            })()}

            {/* Statement bill notice — brought-forward is excluded from booking. */}
            {Number(header.brought_forward || 0) > 0 && (
              <div className="rounded-lg border border-info/40 bg-info/10 p-3 flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-info shrink-0" />
                <div className="text-xs text-foreground leading-relaxed">
                  <span className="font-medium">Statement bill:</span>{" "}
                  {fmtHK(Number(header.brought_forward || 0))} brought forward from prior bills is excluded — booking current charges of{" "}
                  <span className="font-medium">{fmtHK(Number(header.total_amount || 0))}</span> only.
                  {header.statement_total != null && (
                    <> Statement total {fmtHK(Number(header.statement_total))} should equal this vendor's payable balance after posting.</>
                  )}
                </div>
              </div>
            )}

            {/* Bill identity */}
            <FormSection
              title="Bill identity"
              description="Who the bill is from and how it's referenced."
            >
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
                  {showInlineCreateVendor && (
                    <button
                      type="button"
                      onClick={createVendorInline}
                      disabled={creatingVendor}
                      className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {creatingVendor ? "Creating…" : <>Not in master data — Create “{trimmedVName}”</>}
                    </button>
                  )}
                </div>
                <div>
                  <Label>Bill / Invoice #</Label>
                  <Input value={header.bill_number || ""} onChange={(e) => setHeader({ ...header, bill_number: e.target.value })} />
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
                  <Label>Currency</Label>
                  <Input value={header.currency || "HKD"} onChange={(e) => setHeader({ ...header, currency: e.target.value })} />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border/50">
                <AllocationProfilePicker
                  mode={(header as any).cost_allocation_mode}
                  profileId={(header as any).cost_allocation_profile_id}
                  onChange={(m, pid) => setHeader({
                    ...header,
                    cost_allocation_mode: m,
                    cost_allocation_profile_id: pid,
                  } as any)}
                />
              </div>
            </FormSection>

            {/* Dates */}
            <FormSection title="Dates" description="Recognition and service period.">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label>Bill date</Label>
                  <Input type="date" value={header.bill_date || ""} onChange={(e) => setHeader({ ...header, bill_date: e.target.value })} />
                </div>
                <div>
                  <Label>Due date</Label>
                  <Input type="date" value={header.due_date || ""} onChange={(e) => setHeader({ ...header, due_date: e.target.value })} />
                </div>
                <div>
                  <Label>Service period start</Label>
                  <Input type="date" value={header.service_period_start || ""} onChange={(e) => setHeader({ ...header, service_period_start: e.target.value })} />
                </div>
                <div>
                  <Label>Service period end</Label>
                  <Input type="date" value={header.service_period_end || ""} onChange={(e) => setHeader({ ...header, service_period_end: e.target.value })} />
                </div>
              </div>
            </FormSection>

            {/* Financials */}
            <FormSection
              title="Financials"
              description="Subtotal + tax always equals total. Editing subtotal or tax recomputes the total."
              aside={
                <div className="text-right font-display text-lg font-semibold tabular-nums whitespace-nowrap">
                  {fmtHK(Number(header.total_amount || 0))}
                </div>
              }
            >
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Subtotal</Label>
                  <Input type="number" step="0.01" value={header.subtotal ?? 0} onChange={(e) => {
                    const sub = parseFloat(e.target.value) || 0;
                    const tax = Number(header.tax_amount || 0);
                    setHeader({ ...header, subtotal: sub, total_amount: sub + tax });
                  }} className="text-right font-mono" />
                </div>
                <div>
                  <Label>Tax amount</Label>
                  <Input type="number" step="0.01" value={header.tax_amount ?? 0} onChange={(e) => {
                    const tax = parseFloat(e.target.value) || 0;
                    const sub = Number(header.subtotal || 0);
                    setHeader({ ...header, tax_amount: tax, total_amount: sub + tax });
                  }} className="text-right font-mono" />
                </div>
                <div>
                  <Label>Total amount</Label>
                  <Input type="number" step="0.01" value={header.total_amount ?? 0} onChange={(e) => setHeader({ ...header, total_amount: parseFloat(e.target.value) || 0 })} className="text-right font-mono" />
                </div>
              </div>
            </FormSection>

            {/* Notes & attachment */}
            <FormSection title="Notes & attachment">
              <div className="space-y-3">
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
              </div>
            </FormSection>

            {/* Allocations */}
            {(() => {
              const hasDeptData = allocations.some((a) => (a.department || "").trim() !== "");
              const hasTaxData = allocations.some((a) => a.tax_treatment && a.tax_treatment !== "none");
              const showDept = allocColPrefs.department || hasDeptData;
              const showTax = allocColPrefs.tax || hasTaxData;
              return (
            <FormSection
              title="Expense allocation"
              description="Distribute the subtotal across categories and GL accounts. Every line needs an account before posting."
              aside={
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Toggle columns">
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-56">
                      <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Optional columns</div>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={showDept}
                            disabled={hasDeptData}
                            onCheckedChange={(v) => setAllocColPrefs((p) => ({ ...p, department: !!v }))}
                          />
                          <span>Department</span>
                          {hasDeptData && <span className="ml-auto text-[10px] text-muted-foreground">in use</span>}
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={showTax}
                            disabled={hasTaxData}
                            onCheckedChange={(v) => setAllocColPrefs((p) => ({ ...p, tax: !!v }))}
                          />
                          <span>Tax</span>
                          {hasTaxData && <span className="ml-auto text-[10px] text-muted-foreground">in use</span>}
                        </label>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button size="sm" variant="outline" className="h-8" onClick={addAllocation}>
                    <Plus className="h-3 w-3 mr-1" /> Add row
                  </Button>
                </div>
              }
            >
              <div className="rounded-md border border-border/60">
                <Table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-[190px]" />
                    <col className="w-[210px]" />
                    <col className="w-[150px]" />
                    {showDept && <col className="w-[140px]" />}
                    <col className="w-[150px]" />
                    {showTax && <col className="w-[110px]" />}
                    <col />
                    <col className="w-[44px]" />
                  </colgroup>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Category</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Account</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Venue</TableHead>
                      {showDept && <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Department</TableHead>}
                      <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                      {showTax && <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Tax</TableHead>}
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground min-w-[160px]">Notes</TableHead>
                      <TableHead className=""></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocations.map((a, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="py-2.5 align-top">
                          {(() => {
                            const matched = categories.find(
                              (c) => c.name.toLowerCase() === (a.expense_category || "").toLowerCase()
                            );
                            const selectValue = matched ? matched.id : (a.expense_category ? CATEGORY_OTHER : "");
                            const label = matched?.name || a.expense_category || "";
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
                                        account_id: a.account_id || cat?.default_account_id || null,
                                      });
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-9 w-full" title={label}>
                                    <span className="truncate text-left">
                                      <SelectValue placeholder="Select category" />
                                    </span>
                                  </SelectTrigger>
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
                        <TableCell className="py-2.5 align-top">
                          {(() => {
                            const acc = accounts.find(ac => ac.id === a.account_id);
                            const label = acc ? `${acc.code} — ${acc.name}` : "";
                            return (
                              <Select value={a.account_id || ""} onValueChange={(v) => updateAlloc(idx, { account_id: v })}>
                                <SelectTrigger className="h-9 w-full" title={label}>
                                  <span className="truncate text-left">
                                    <SelectValue placeholder="GL account" />
                                  </span>
                                </SelectTrigger>
                                <SelectContent>
                                  {accounts.filter(ac => ac.id).map((ac) => (
                                    <SelectItem key={ac.id} value={ac.id}>{ac.code} — {ac.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="py-2.5 align-top">
                          <Select value={a.venue || ""} onValueChange={(v) => updateAlloc(idx, { venue: v })}>
                            <SelectTrigger className="h-9 w-full" title={a.venue || ""}>
                              <span className="truncate text-left">
                                <SelectValue placeholder="—" />
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {venues.filter(v => v.name).map(v => (<SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        {showDept && (
                          <TableCell className="py-2.5 align-top">
                            <Input className="h-9" value={a.department || ""} onChange={(e) => updateAlloc(idx, { department: e.target.value })} placeholder="—" />
                          </TableCell>
                        )}
                        <TableCell className="py-2.5 align-top text-right">
                          <AmountCell value={Number(a.amount || 0)} onChange={(n) => updateAlloc(idx, { amount: n })} />
                        </TableCell>
                        {showTax && (
                          <TableCell className="py-2.5 align-top">
                            <Select value={a.tax_treatment || "none"} onValueChange={(v: any) => updateAlloc(idx, { tax_treatment: v })}>
                              <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="inclusive">Inclusive</SelectItem>
                                <SelectItem value="exclusive">Exclusive</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        )}
                        <TableCell className="py-2.5 align-top">
                          <Input className="h-9" value={a.notes || ""} onChange={(e) => updateAlloc(idx, { notes: e.target.value })} placeholder="Optional" />
                        </TableCell>
                        <TableCell className="py-2.5 align-top">
                          <Button variant="ghost" size="icon" onClick={() => removeAlloc(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {(() => {
                const delta = allocTotal - expectedAllocTotal;
                const abs = Math.abs(delta);
                return (
                  <div className="mt-3 flex justify-end items-center gap-3 text-sm tabular-nums">
                    <span className="text-muted-foreground">Allocated</span>
                    <span className="font-semibold text-foreground">{fmtHK(allocTotal)}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-muted-foreground">{fmtHK(expectedAllocTotal)}</span>
                    {allocations.length > 0 && (
                      balanced ? (
                        <span className="ml-1 inline-flex items-center gap-1 text-primary text-xs font-medium">✓ Balanced</span>
                      ) : (
                        <span className="ml-1 inline-flex items-center gap-1 text-warning text-xs font-medium">
                          <AlertTriangle className="h-3 w-3" />
                          {delta > 0 ? "Over by " : "Short by "}{fmtHK(abs)}
                        </span>
                      )
                    )}
                  </div>
                );
              })()}
              {/* Legacy per-line GL warning removed — see the Readiness checklist above the actions. */}
            </FormSection>
              );
            })()}

            {/* Payments */}
            {editing && (
              <FormSection
                title="Payments"
                description={editing.approval_status === "posted" && editing.payment_status !== "paid"
                  ? "Record payments as they come in. Each one posts to the ledger."
                  : undefined}
                aside={editing.approval_status === "posted" && editing.payment_status !== "paid" && isAdmin ? (
                  <Button size="sm" variant="outline" className="h-8" onClick={() => {
                    setPayForm({ ...payForm, amount: String(editing.total_amount - editing.paid_amount) });
                    setPayDialogOpen(true);
                  }}>Record payment</Button>
                ) : undefined}
              >
                {payments.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No payments recorded yet.</p>
                ) : (
                  <div className="rounded-md border border-border/60 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Date</TableHead>
                          <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Method</TableHead>
                          <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Reference</TableHead>
                          <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="whitespace-nowrap">{fmtDate(p.payment_date)}</TableCell>
                            <TableCell className="capitalize">{p.payment_method.replace("_", " ")}</TableCell>
                            <TableCell className="text-muted-foreground">{p.reference || "—"}</TableCell>
                            <TableCell className="text-right td-num tabular-nums whitespace-nowrap font-medium">{fmtHK(p.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </FormSection>
            )}

            {/* Audit trail */}
            {editing && audit.length > 0 && (
              <FormSection title="Audit trail" description="Every workflow step, with actor and timestamp.">
                <ol className="space-y-2 relative border-l border-border/60 pl-4">
                  {audit.map((row) => (
                    <li key={row.id} className="relative">
                      <span className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full bg-primary/60 border border-background" />
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusPill variant={approvalVariant(row.event_type) === "neutral" ? "neutral" : approvalVariant(row.event_type)}>
                          {row.event_type.replace(/_/g, " ")}
                        </StatusPill>
                        <span className="text-xs text-foreground/80">{row.actor_name || row.actor_id?.slice(0, 8) || "system"}</span>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {new Date(row.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              </FormSection>
            )}

            {/* Readiness checklist — mirrors the DB approval-gate trigger.
                Live pass/fail per requirement so users know before they click Approve.
                Hidden once the bill has already passed approval (posted/reversed). */}
            {header.approval_status !== "posted" && header.approval_status !== "reversed" && header.approval_status !== "void" && (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                  Readiness to approve
                </div>
                <ul className="space-y-2 text-sm">
                  {[
                    {
                      pass: vendorLinked,
                      grandfathered: !vendorLinked && grandfatheredVendor,
                      label: "Vendor linked to master data",
                      failHint: "Pick a vendor from the list, or use “Create” next to the vendor name.",
                      grandfatheredHint: "Approved before vendor linking was required — not blocking retroactively.",
                    },
                    {
                      pass: allocationsHaveCategory,
                      label: "Every allocation line has a category",
                      failHint: "Set a category on each row of the expense allocation table.",
                    },
                    {
                      pass: allocationsHaveAccount,
                      label: "Every allocation line has a GL account",
                      failHint: "Pick a category with a default account, or set an account explicitly.",
                    },
                    {
                      pass: allocationsBalance,
                      label: "Allocations balance to subtotal",
                      failHint: "Adjust line amounts so the total matches the bill subtotal (±0.01).",
                    },
                  ].map((item, i) => {
                    const amber = item.grandfathered;
                    const ok = item.pass && !amber;
                    return (
                      <li key={i} className="flex items-start gap-2">
                        {ok ? (
                          <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                        ) : amber ? (
                          <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className={ok ? "text-foreground" : amber ? "text-warning" : "text-foreground"}>
                            {item.label}
                          </div>
                          {!ok && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {amber ? item.grandfatheredHint : item.failHint}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Actions — clear primary CTA on the right, secondary/destructive on the left. */}
            <div className="sticky bottom-0 -mx-6 px-6 py-4 border-t border-border/60 bg-background/95 backdrop-blur flex flex-wrap items-center gap-2">
              {editing && editing.approval_status === "posted" && isAdmin && (
                <Button
                  variant="outline"
                  className="text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Reverse this bill?",
                      description:
                        "This creates a new reversing journal entry (mirror of the original) and marks the original as void. Nothing is deleted — the full audit trail is preserved. To correct a posted bill, reverse it and then create a new corrected bill.",
                      confirmLabel: "Yes, reverse bill",
                      tone: "destructive",
                    });
                    if (!ok) return;
                    const done = await reverseBill(editing.id);
                    if (done) { setEditing(null); setEditorOpen(false); }
                  }}
                >
                  Reverse
                </Button>
              )}
              {editing && editing.approval_status !== "void" && editing.approval_status !== "posted" && editing.approval_status !== "reversed" && isAdmin && (
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Void this bill?",
                      description: "Voided bills are excluded from all reports and totals. They remain visible for audit but are not editable.",
                      confirmLabel: "Void bill",
                      tone: "destructive",
                    });
                    if (ok) handleSave("void");
                  }}
                >
                  Void
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="outline" onClick={() => handleSave()}>Save draft</Button>
              {header.approval_status === "draft" && (
                <Button variant="outline" onClick={() => handleSave("pending_review")}>Submit for review</Button>
              )}
              {header.approval_status === "pending_review" && isAdmin && (
                <>
                  <Button variant="outline" onClick={() => handleSave("rejected")}>Reject</Button>
                  <Button variant="outline" onClick={() => handleSave("approved")}>Approve</Button>
                </>
              )}
              {(header.approval_status === "approved" || header.approval_status === "pending_review") && isAdmin && editing && (
                <Button onClick={handlePost}>
                  Approve &amp; post to GL
                </Button>
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

      
      {confirmDialog}
    </div>
  );
}
