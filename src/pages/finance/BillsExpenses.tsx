import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageTop } from "@/components/kit/PageTop";
import { Toolbar } from "@/components/kit/Toolbar";
import { QuickFilter } from "@/components/kit/QuickFilter";
import { FilterPanel, FilterGroup } from "@/components/kit/FilterPanel";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import { useVenueScope } from "@/hooks/useVenueScope";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { downloadCSV } from "@/utils/csvDownload";
import { formatCurrency, formatDate } from "@/utils/format";
import { isWaitingBill, expenseStatus, proposedCategoryAccount, similarVendors } from "@/utils/expenses";
import { useVendorStatements } from "@/hooks/useVendorStatements";
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
  const [supplierAccounts, setSupplierAccounts] = useState<Array<{ id: string; account_number: string; label: string | null; default_venue_id: string | null; default_gl_account_id: string | null; is_active: boolean }>>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(new URLSearchParams(location.search).get("status") === "waiting" ? "waiting" : "all");
  const scope = useVenueScope(); const period = usePeriodFilter(bills.map(b => b.bill_date), "all");
  const { isPreviewActive } = usePreviewMode();
  const canWrite = isAdmin && !isPreviewActive;
  const statements = useVendorStatements();
  const [scanOpen, setScanOpen] = useState(false);
  const [vendorFilter, setVendorFilter] = useState("all"), [categoryFilter, setCategoryFilter] = useState("all");
  const [categoryOpen, setCategoryOpen] = useState(false), [categoryLinks, setCategoryLinks] = useState<Record<string,string>>({});
  const [ask, setAsk] = useState(""), [answer, setAnswer] = useState(""), [bulk, setBulk] = useState<ExpenseBill[] | null>(null), [busy, setBusy] = useState(false);
  const [lineIndex, setLineIndex] = useState<Record<string,string[]>>({});
  const [statementDoc, setStatementDoc] = useState<(typeof statements.statements)[number] | null>(null);
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

  // Load supplier accounts whenever selected vendor changes in the editor.
  useEffect(() => {
    if (!tenantId || !header.supplier_id) { setSupplierAccounts([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("supplier_accounts")
        .select("id, account_number, label, default_venue_id, default_gl_account_id, is_active")
        .eq("tenant_id", tenantId)
        .eq("supplier_id", header.supplier_id)
        .order("account_number");
      if (!cancelled) setSupplierAccounts((data || []) as any[]);
    })();
    return () => { cancelled = true; };
  }, [tenantId, header.supplier_id]);

  // Normalizer used to match a scanned account_number against supplier_accounts.
  const normAcct = (s: string | null | undefined) => (s || "").replace(/\s+/g, "").toLowerCase();

  // Extracted-but-unlinked account number from the scanner, held so we can
  // (a) auto-link once supplier_accounts loads, or (b) show a banner.
  const extractedAcctNumber: string | null =
    ((header as any)?.meta?.account_number as string | null | undefined) || null;

  // Auto-link scanned account_number → supplier_accounts, then apply defaults
  // only if they aren't already filled from the scan.
  useEffect(() => {
    if (!header.supplier_id || !extractedAcctNumber) return;
    if ((header as any).supplier_account_id) return;
    if (supplierAccounts.length === 0) return;
    const target = normAcct(extractedAcctNumber);
    const match = supplierAccounts.find((sa) => normAcct(sa.account_number) === target);
    if (!match) return;
    setHeader((h) => {
      const next: any = { ...h, supplier_account_id: match.id };
      if (!h.venue_id && match.default_venue_id) {
        const ven = venues.find((x) => x.id === match.default_venue_id);
        if (ven) { next.venue_id = ven.id; next.venue = ven.name; }
      }
      return next;
    });
    if (match.default_gl_account_id) {
      setAllocations((prev) => {
        if (!prev.length) return prev;
        const first = prev[0];
        if (first.account_id) return prev;
        const copy = prev.slice();
        copy[0] = { ...first, account_id: match.default_gl_account_id };
        return copy;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierAccounts, extractedAcctNumber, header.supplier_id]);

  // Banner: scanned an account number but no matching supplier_accounts row.
  const [creatingAcct, setCreatingAcct] = useState(false);
  const scannedAcctHasMatch = useMemo(() => {
    if (!extractedAcctNumber) return true;
    const target = normAcct(extractedAcctNumber);
    return supplierAccounts.some((sa) => normAcct(sa.account_number) === target);
  }, [supplierAccounts, extractedAcctNumber]);
  const showCreateAcctBanner =
    !!extractedAcctNumber && !!header.supplier_id && !(header as any).supplier_account_id && !scannedAcctHasMatch;

  const createSupplierAccountFromScan = async () => {
    if (!tenantId || !header.supplier_id || !extractedAcctNumber) return;
    setCreatingAcct(true);
    const { data, error } = await (supabase as any)
      .from("supplier_accounts")
      .insert({
        tenant_id: tenantId,
        supplier_id: header.supplier_id,
        account_number: extractedAcctNumber,
        is_active: true,
      })
      .select("id, account_number, label, default_venue_id, default_gl_account_id, is_active")
      .single();
    setCreatingAcct(false);
    if (error) { toast.error(error.message || "Could not create account"); return; }
    setSupplierAccounts((prev) => [...prev, data]);
    setHeader((h) => ({ ...h, supplier_account_id: data.id } as any));
    toast.success(`Supplier account ${data.account_number} created and linked.`);
  };

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

  const scopedBills = bills.filter(b => period.inPeriod(b.bill_date) && (b.venue_id ? scope.includesId(b.venue_id) : scope.includesName(b.venue)));
  const filtered = scopedBills.filter(b => (statusFilter === "all" || statusFilter === "waiting" && isWaitingBill(b) || statusFilter === "to-pay" && b.approval_status === "posted" && b.payment_status !== "paid" || statusFilter === "paid" && b.payment_status === "paid") && (vendorFilter === "all" || b.supplier_id === vendorFilter) && (categoryFilter === "all" || lineIndex[b.id]?.includes(categoryFilter)) && `${supplierName(b.supplier_id)} ${b.vendor_name ?? ''} ${b.notes ?? ''} ${b.bill_number ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const waiting = scopedBills.filter(isWaitingBill);
  useEffect(() => { if (!tenantId) return; supabase.from('expense_bill_allocations').select('bill_id,expense_category').eq('tenant_id',tenantId).then(({data})=>{ const index:Record<string,string[]>={}; for(const a of data??[]) index[a.bill_id]=[...(index[a.bill_id]??[]),a.expense_category??'']; setLineIndex(index); }); },[tenantId,bills]);
  const missingCategories = categories.filter(c=>!c.default_account_id);
  const vendorPairs = similarVendors(suppliers);
  const askBani = async () => {
    const command=ask.trim();
    const match=command.match(/^approve all (.+?) bills[.!]?$/i);
    if(match){ const term=match[1].toLowerCase(); const candidates=scopedBills.filter(b=>isWaitingBill(b)&&`${b.notes??''} ${b.vendor_name??''} ${(lineIndex[b.id]??[]).join(' ')}`.toLowerCase().includes(term)); if(!candidates.length){setAnswer('No matching waiting bills in this period.');return;} setBulk(candidates); setAnswer(''); return; }
    if (/how much|total|waiting|to pay/i.test(command)) { setAnswer(`${period.label}: ${formatCurrency(scopedBills.reduce((n,b)=>n+b.total_amount,0))} across ${scopedBills.length} bills; ${waiting.length} waiting for you (${formatCurrency(waiting.reduce((n,b)=>n+b.total_amount,0))}).`);return; }
    setAnswer('Which bills? Include a vendor or category and the instruction, for example approve all rent bills.');
  };

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
        account_id: categories.find(c=>c.name.toLowerCase()===a.expense_category.toLowerCase())?.default_account_id || proposedCategoryAccount(a.expense_category,accounts) || null,
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
    setScanOpen(false);
    setEditorOpen(true);
  };

  const allocTotal = allocations.reduce((s, a) => s + Number(a.amount || 0), 0);
  const expectedAllocTotal = Number(header.subtotal || 0) || (Number(header.total_amount || 0) - Number(header.tax_amount || 0));
  const balanced = Math.abs(allocTotal - expectedAllocTotal) < 0.01;

  const handleSave = async (newStatus?: BillApprovalStatus) => {
    if (splitDraft.mode === "split" && !splitDraft.balanced) {
      toast.error("Venue split is not balanced");
      return;
    }
    const payload: Partial<ExpenseBill> = { ...header, cost_allocation_mode: splitDraft.mode } as any;
    if (newStatus) payload.approval_status = newStatus;
    const id = await saveBill(payload, allocations);
    if (id && tenantId) {
      await saveVenueSplit({
        tenantId, ownerType: "expense_bill", ownerId: id,
        mode: splitDraft.mode, lines: splitDraft.lines,
        baseAmount: Number(header.total_amount || 0),
      });
    }
    if (id && linkedBankTxn && tenantId) {
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
    if (!canWrite || busy || !balanced || !allocationsHaveAccount) return;
    setBusy(true);
    try {
      // Save corrections first in review state; approval and posting are one transaction.
      const id = await saveBill({...header, approval_status:'pending_review'}, allocations);
      if (!id) return;
      if (tenantId) await saveVenueSplit({tenantId,ownerType:'expense_bill',ownerId:id,mode:splitDraft.mode,lines:splitDraft.lines,baseAmount:Number(header.total_amount||0)});
      const ok = await postBill(id);
      if (ok) setEditorOpen(false);
    } finally { setBusy(false); }
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
    <div className="w-full min-w-0 space-y-5 pb-24">
      <PageTop title="Expenses" actionsBesideTitle actions={<Button onClick={()=>setScanOpen(true)}><FileText className="h-4 w-4"/>Scan or upload</Button>} period={period.control}/>
      <section className="kit card-glass overflow-hidden">
        <div className="p-4 sm:p-5 space-y-3">
          <h2 className="text-base font-semibold break-words">{period.label} · {scopedBills.length} bills · {formatCurrency(scopedBills.reduce((n,b)=>n+b.total_amount,0))}</h2>
          <p className="text-sm text-muted-foreground">{waiting.length} waiting for you ({formatCurrency(waiting.reduce((n,b)=>n+b.total_amount,0))})</p>
          {missingCategories.length>0&&<div className="kit-explain">{missingCategories.length} categories aren't linked to an account. <Button variant="link" className="p-0 h-auto text-warning" onClick={()=>{setCategoryLinks(Object.fromEntries(missingCategories.map(c=>[c.id,proposedCategoryAccount(c.name,accounts)])));setCategoryOpen(true);}}>Check accounts</Button></div>}
          {vendorPairs.length>0&&<div className="kit-explain">Merge? {vendorPairs.map(pair=><div key={pair.a.id+pair.b.id} className="flex flex-wrap gap-2 items-center"><span>{pair.a.name} / {pair.b.name}</span><Button variant="link" className="p-0 h-auto text-warning" disabled={!canWrite||busy} onClick={async()=>{if(!tenantId)return;const ok=await confirm({title:'Merge these expense vendors?',description:`Relink editable bills and regular rules from ${pair.a.name} to ${pair.b.name}. Booked bills and Purchasing records stay unchanged.`,confirmLabel:'Confirm merge'});if(!ok)return;setBusy(true);const {error}=await supabase.rpc('merge_expense_vendor',{p_tenant:tenantId,p_from:pair.a.id,p_into:pair.b.id});setBusy(false);if(error)toast.error(error.message);else{toast.success('Expense vendors linked');window.location.reload();}}}>Check merge</Button></div>)}</div>}
          <QuickFilter label="Bills" value={statusFilter} onChange={setStatusFilter} options={[{key:'all',label:'All'},{key:'waiting',label:'Waiting for you'},{key:'to-pay',label:'To pay'},{key:'paid',label:'Paid'}]}/>
          <Toolbar search={search} onSearch={setSearch} placeholder="Search bills" mobileSearchBelow searchAfterControls filter={<FilterPanel activeCount={Number(vendorFilter!=='all')+Number(categoryFilter!=='all')} onReset={()=>{setVendorFilter('all');setCategoryFilter('all');}} resultLabel={`Show ${filtered.length} bills`}><FilterGroup title="Venue"><span className="text-sm">{scope.label}</span></FilterGroup><FilterGroup title="Vendor"><Select value={vendorFilter} onValueChange={setVendorFilter}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All vendors</SelectItem>{suppliers.map(s=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></FilterGroup><FilterGroup title="Category"><Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{categories.map(c=><SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent></Select></FilterGroup></FilterPanel>} onDownload={()=>downloadCSV(filtered.map(b=>({date:b.bill_date,vendor:b.vendor_name,amount:b.total_amount,status:expenseStatus(b)})),[{key:'date',label:'Date'},{key:'vendor',label:'From'},{key:'amount',label:'Amount'},{key:'status',label:'Status'}],'expenses')}/>
          <form className="flex gap-2" onSubmit={e=>{e.preventDefault();void askBani();}}><Input aria-label="Ask Bani about expenses" placeholder="Ask Bani" value={ask} onChange={e=>setAsk(e.target.value)}/><Button variant="outline" type="submit">Ask</Button></form>
          {answer&&<p className="text-sm">{answer}</p>}
          {bulk&&<div className="border border-border rounded-lg p-3 space-y-2"><p className="font-medium">Approve {bulk.length} bills · {formatCurrency(bulk.reduce((n,b)=>n+b.total_amount,0))}</p>{bulk.map(b=><p key={b.id} className="text-sm">{b.vendor_name} · {formatDate(b.bill_date)} · {formatCurrency(b.total_amount)}</p>)}<div className="flex gap-2"><Button disabled={!canWrite||busy} onClick={async()=>{setBusy(true);let n=0;for(const b of bulk){if(await postBill(b.id))n++;else break;}setBusy(false);setBulk(null);setAnswer(`${n} bills booked.`);}}>Confirm</Button><Button variant="outline" onClick={()=>setBulk(null)}>Cancel</Button></div></div>}
        </div>
        {loading?<p className="p-5 text-muted-foreground">Loading bills…</p>:<><table className="hidden md:table w-full table-fixed text-sm"><thead className="border-y border-border text-muted-foreground text-xs"><tr><th className="text-left px-5 py-3 w-[18%]">Date</th><th className="text-left px-3 w-[42%]">From</th><th className="text-right px-3 w-[18%]">Amount</th><th className="text-left px-5">Status</th></tr></thead><tbody>{filtered.map(b=><tr key={b.id} className="border-b border-border/50 cursor-pointer hover:bg-muted/30" onClick={()=>openEditor(b)}><td className="px-5 py-3">{formatDate(b.bill_date)}</td><td className="px-3 break-words">{supplierName(b.supplier_id)!=='—'?supplierName(b.supplier_id):b.vendor_name}<p className="text-xs text-muted-foreground">{b.notes||lineIndex[b.id]?.join(', ')||b.bill_number||'Bill'} · {b.venue||'Unassigned venue'}</p></td><td className="px-3 td-num text-right">{formatCurrency(b.total_amount)}</td><td className="px-5">{expenseStatus(b)}</td></tr>)}</tbody></table><div className="md:hidden divide-y divide-border">{filtered.map(b=><Button key={b.id} variant="ghost" className="w-full h-auto block text-left whitespace-normal rounded-none p-4" onClick={()=>openEditor(b)}><div className="flex justify-between gap-3"><span className="min-w-0 break-words">{b.vendor_name||supplierName(b.supplier_id)}</span><span className="td-num shrink-0">{formatCurrency(b.total_amount)}</span></div><p className="text-xs text-muted-foreground mt-1">{b.notes||lineIndex[b.id]?.join(', ')||'Bill'} · {b.venue||'Unassigned venue'}</p><p className="text-xs mt-2">{formatDate(b.bill_date)} · {expenseStatus(b)}</p></Button>)}</div>{!filtered.length&&<p className="p-8 text-center text-muted-foreground">No bills in this view.</p>}</>}
        {statements.statements.filter(s=>period.inPeriod(s.statement_date)&&scope.includesId(s.venue_id)&&(vendorFilter==='all'||s.supplier_id===vendorFilter)&&`${s.vendor_name} ${s.notes}`.toLowerCase().includes(search.toLowerCase())).map(s=><Button key={s.id} variant="ghost" className="w-full h-auto flex justify-between text-left whitespace-normal rounded-none p-4 border-t border-border" onClick={()=>setStatementDoc(s)}><span className="break-words">{s.vendor_name}<span className="block text-xs text-muted-foreground">Statement document · {formatDate(s.statement_date)}</span></span><span className="shrink-0 text-xs">Document</span></Button>)}
      </section>
      <Dialog open={scanOpen} onOpenChange={setScanOpen}><DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Scan or upload</DialogTitle></DialogHeader><BillDropZone onParsed={handleScanned}/><Button variant="outline" onClick={()=>{setScanOpen(false);void openEditor(null);}}>Type a bill</Button></DialogContent></Dialog>
      <Dialog open={!!statementDoc} onOpenChange={o=>!o&&setStatementDoc(null)}><DialogContent><DialogHeader><DialogTitle>Statement · {statementDoc?.vendor_name}</DialogTitle></DialogHeader><p>{statementDoc?.notes||'Statement document'}</p>{statementDoc?.attachment_url&&<a className="text-primary underline" href={statementDoc.attachment_url} target="_blank" rel="noreferrer">View attachment</a>}<p className="text-xs text-muted-foreground">Statement balances are not counted as new bills.</p></DialogContent></Dialog>
      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Link categories to accounts</DialogTitle></DialogHeader>{missingCategories.map(c=><div key={c.id} className="space-y-1"><Label>{c.name}</Label><Select value={categoryLinks[c.id]||'none'} onValueChange={v=>setCategoryLinks(p=>({...p,[c.id]:v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Pick an account</SelectItem>{accounts.map(a=><SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent></Select>{c.name==='Equipment'&&<p className="text-xs text-muted-foreground">Operating supplies by default. Choose 1520 Kitchen Equipment for a qualifying asset; the asset threshold has not been supplied.</p>}</div>)}<DialogFooter><Button variant="outline" onClick={()=>setCategoryOpen(false)}>Cancel</Button><Button disabled={!canWrite||busy||missingCategories.some(c=>!categoryLinks[c.id]||categoryLinks[c.id]==='none')} onClick={async()=>{if(!tenantId)return;setBusy(true);const {error}=await supabase.rpc('approve_expense_category_accounts',{p_tenant:tenantId,p_links:missingCategories.map(c=>({category_id:c.id,account_id:categoryLinks[c.id]}))});setBusy(false);if(error)toast.error(error.message);else{setCategories(p=>p.map(c=>({...c,default_account_id:categoryLinks[c.id]||c.default_account_id})));setCategoryOpen(false);toast.success('Category accounts linked');}}}>Approve</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader className="pr-8">
            <div className="flex items-center gap-3 flex-wrap">
              <DialogTitle className="text-lg">
                {editing ? (editing.bill_number ? `Bill · ${editing.bill_number}` : "Bill") : "New Bill"}
              </DialogTitle>
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
          </DialogHeader>

          <div className="space-y-5 mt-5">
            <p className="text-sm text-muted-foreground">{header.attachment_path || header.attachment_url ? 'Read from the attached invoice · check against the original before approving' : 'No invoice attached — entered manually'}</p>
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
                  <Label>Supplier account</Label>
                  <Select
                    value={(header as any).supplier_account_id || "__none__"}
                    disabled={!header.supplier_id || supplierAccounts.length === 0}
                    onValueChange={(v) => {
                      if (v === "__none__") {
                        setHeader((h) => ({ ...h, supplier_account_id: null } as any));
                        return;
                      }
                      const sa = supplierAccounts.find((x) => x.id === v);
                      setHeader((h) => {
                        const next: any = { ...h, supplier_account_id: v };
                        if (sa?.default_venue_id) {
                          const ven = venues.find((x) => x.id === sa.default_venue_id);
                          if (ven) { next.venue_id = ven.id; next.venue = ven.name; }
                        }
                        if (sa?.default_gl_account_id) {
                          // Default GL applies to the first allocation line if it's empty.
                          setAllocations((prev) => {
                            if (!prev.length) return prev;
                            const first = prev[0];
                            if (first.account_id) return prev;
                            const copy = prev.slice();
                            copy[0] = { ...first, account_id: sa.default_gl_account_id };
                            return copy;
                          });
                        }
                        return next;
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={header.supplier_id ? (supplierAccounts.length === 0 ? "No accounts for this vendor" : "Select account") : "Pick vendor first"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {supplierAccounts.map((sa) => (
                        <SelectItem key={sa.id} value={sa.id}>
                          {sa.account_number}{sa.label ? ` · ${sa.label}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {showCreateAcctBanner && (
                  <div className="md:col-span-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs flex items-center justify-between gap-3">
                    <span>
                      Detected account <span className="font-mono font-medium">{extractedAcctNumber}</span> on the scan — no matching supplier account for this vendor.
                    </span>
                    <Button size="sm" variant="outline" onClick={createSupplierAccountFromScan} disabled={creatingAcct}>
                      {creatingAcct ? "Creating…" : `Create account ${extractedAcctNumber}`}
                    </Button>
                  </div>
                )}
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
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Cost allocation</div>
                <VenueSplitEditor
                  ownerType="expense_bill"
                  ownerId={editing?.id || null}
                  mode={(header as any).cost_allocation_mode}
                  baseAmount={Number(header.total_amount || 0)}
                  onChange={(mode, lines, balanced) => {
                    setSplitDraft({ mode, lines, balanced });
                    setHeader(h => ({ ...h, cost_allocation_mode: mode } as any));
                  }}
                />
              </div>
            </FormSection>

            {/* Dates */}
            <FormSection title="Dates" description="Recognition and service period.">
              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
              title="What for · Account"
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
              <div className="rounded-md border border-border/60 overflow-x-auto">
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
                                    <SelectValue placeholder="Pick an account" />
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
              {!['posted','reversed','void'].includes(header.approval_status||'')&&<><Button variant="outline" disabled={!canWrite||busy} onClick={() => handleSave()}>Change</Button><Button disabled={!canWrite||busy||!balanced||!allocationsHaveAccount} onClick={handlePost}>{busy?'Booking…':'Approve'}</Button></>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
