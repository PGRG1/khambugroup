import {matchExpenseSupplier,type MeterAccount} from '@/utils/expenseSupplierAccounts';
import {BillReadDetails} from "@/components/expenses/BillReadDetails";
import {SupplierNameLink} from "@/components/vendors/SupplierProfileDialog";
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
import { usePagePeriod } from "@/hooks/usePagePeriod";
import { useVenueScope } from "@/hooks/useVenueScope";
import { useBaniWorkPublisher } from "@/components/assistant/FloatingBaniContext";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { downloadCSV } from "@/utils/csvDownload";
import { formatCurrency, formatDate } from "@/utils/format";
import { isWaitingBill, expenseStatus, proposedCategoryAccount, similarVendors } from "@/utils/expenses";
import { usesContractBillApproval } from '@/utils/expenseMonthlyApproval';
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
import { useBaniAccounting } from '@/hooks/useBaniAccounting';
import { CashBoxReceipts } from '@/components/expenses/CashBoxReceipts';
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
  const baniAccounting=useBaniAccounting();
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

  const [allMeters,setAllMeters]=useState<MeterAccount[]>([]),[aliases,setAliases]=useState<{supplier_id:string;alias:string}[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [supplierAccounts, setSupplierAccounts] = useState<Array<{ id: string; account_number: string; label: string | null; default_venue_id: string | null; default_gl_account_id: string | null; is_active: boolean }>>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(new URLSearchParams(location.search).get("status") === "waiting" ? "waiting" : "mtd");
  const scope = useVenueScope(); const period = usePagePeriod(bills.map(b => b.bill_date), "mtd");
  const { isPreviewActive } = usePreviewMode();
  const canWrite = isAdmin && !isPreviewActive;
  const statements = useVendorStatements();
  const [scanOpen, setScanOpen] = useState(false);
  const [vendorFilter, setVendorFilter] = useState("mtd"), [categoryFilter, setCategoryFilter] = useState("mtd");
  const [categoryOpen, setCategoryOpen] = useState(false), [categoryLinks, setCategoryLinks] = useState<Record<string,string>>({});
  const [ask, setAsk] = useState(""), [answer, setAnswer] = useState(""), [bulk, setBulk] = useState<ExpenseBill[] | null>(null), [busy, setBusy] = useState(false);
  const [lookupRevision,setLookupRevision]=useState(0);
  const [lineIndex, setLineIndex] = useState<Record<string,string[]>>({});
  const [statementDoc, setStatementDoc] = useState<(typeof statements.statements)[number] | null>(null);
  const [paymentFilter, setPaymentFilter] = useState("mtd");

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
      const [meters,aliasRows]=await Promise.all([supabase.from('supplier_accounts').select('*').eq('tenant_id',tenantId),supabase.from('expense_supplier_aliases').select('*').eq('tenant_id',tenantId)]);
      setAllMeters((meters.data??[]).map(m=>({...m,covers:Array.isArray(m.covers)?m.covers.filter((v):v is {venue_id:string;weight?:number}=>!!v&&typeof v==='object'&&!Array.isArray(v)&&typeof v.venue_id==='string'):[]})));setAliases(aliasRows.data??[]);
    })();
  }, [tenantId,lookupRevision]);

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
  const cashBoxOnly=new URLSearchParams(location.search).get("source")==="cash-box";
  const linkedBillIds=new URLSearchParams(location.search).get("bills")?.split(",").filter(Boolean);
  const filtered = scopedBills.filter(b => (!linkedBillIds||linkedBillIds.includes(b.id)) && !cashBoxOnly && (statusFilter === "all" || statusFilter === "waiting" && isWaitingBill(b) || statusFilter === "to-pay" && b.approval_status === "posted" && b.payment_status !== "paid" || statusFilter === "paid" && b.payment_status === "paid") && (vendorFilter === "all" || b.supplier_id === vendorFilter) && (categoryFilter === "all" || lineIndex[b.id]?.includes(categoryFilter)) && `${supplierName(b.supplier_id)} ${b.vendor_name ?? ''} ${b.notes ?? ''} ${b.bill_number ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const waiting = scopedBills.filter(isWaitingBill);
  const questions=allMeters.filter(m=>!m.covers?.length).map(m=>({id:`meter-${m.id}`,tone:'amber' as const,title:`${supplierName(m.supplier_id)} · a/c ${m.account_number}: which venues does it cover?`,detail:'Confirm once; historical bills stay unchanged.',label:'Answer',question:`Set coverage for supplier account ${m.id} (${m.account_number})`}));
  for(const b of scopedBills){const q=b.meta?.bani_question||(b.meta?.statement_differences?.length?`${b.vendor_name}: statement differs on ${b.meta.statement_differences.join(', ')}`:null);if(q)questions.push({id:`bill-question-${b.id}`,tone:'amber',title:q,detail:'Source evidence needs your answer.',label:'Answer',question:q});}
  useBaniWorkPublisher(location.pathname,[...questions,...(waiting.length?[{id:'waiting-bills',tone:'amber' as const,title:`${waiting.length} bills waiting for you`,detail:period.label,label:'Check',href:'/expenses/bills?status=waiting'}]:[])],!loading);
  useEffect(() => { if (!tenantId) return; supabase.from('expense_bill_allocations').select('bill_id,expense_category').eq('tenant_id',tenantId).then(({data})=>{ const index:Record<string,string[]>={}; for(const a of data??[]) index[a.bill_id]=[...(index[a.bill_id]??[]),a.expense_category??'']; setLineIndex(index); }); },[tenantId,bills]);
  const missingCategories = categories.filter(c=>!c.default_account_id);
  const vendorPairs = similarVendors(suppliers.filter(s=>s.vendor_type==='expense'));
  const askBani = async () => {
    const command=ask.trim();
    const match=command.match(/^approve all (.+?) bills[.!]?$/i);
    if(match){ const term=match[1].toLowerCase(); const candidates=scopedBills.filter(b=>isWaitingBill(b)&&`${b.notes??''} ${b.vendor_name??''} ${(lineIndex[b.id]??[]).join(' ')}`.toLowerCase().includes(term)); if(!candidates.length){setAnswer('No matching waiting bills in this period.');return;} setBulk(candidates); setAnswer(''); return; }
    setBusy(true);
    try { const {data,error}=await supabase.functions.invoke('expense-ask',{body:{tenant_id:tenantId,instruction:command,bill_ids:scopedBills.map(b=>b.id)}}); if(error){const detail=await error.context?.json?.();throw new Error(detail?.error||error.message);} if(data?.bill_ids?.length){setBulk(scopedBills.filter(b=>data.bill_ids.includes(b.id)&&isWaitingBill(b)));setAnswer('');}else setAnswer(data?.answer||'Please specify the bills and instruction.'); } catch(e){setAnswer(e instanceof Error?e.message:'Could not read the instruction.');}finally{setBusy(false);}
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
      const matches=suppliers.filter(s=>s.name.trim().toLowerCase()===(bill.vendor_name??'').trim().toLowerCase());
      setHeader({ ...bill, supplier_id: bill.supplier_id || (matches.length===1?matches[0].id:null) });
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
  const billFromLink=new URLSearchParams(location.search).get('bill');
  useEffect(()=>{const bill=bills.find(b=>b.id===billFromLink);if(bill&&!editorOpen)void openEditor(bill);},[billFromLink,bills.length]);

  const updateAlloc = (idx: number, patch: Partial<ExpenseBillAllocation>) => {
    setAllocations((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeAlloc = (idx: number) => {
    setAllocations((rows) => rows.filter((_, i) => i !== idx));
  };

  const handleScanned = (s: ScannedBill) => {
    const match=matchExpenseSupplier(s,allMeters,suppliers,aliases);
    const matched='supplier_id' in match?suppliers.find(sp=>sp.id===match.supplier_id):undefined;
    const ven = venues.find((v) => v.name.toLowerCase() === (s.venue || "").toLowerCase());
    const bf = Number(s.brought_forward || 0);
    const stTotal =
      s.statement_total === null || s.statement_total === undefined ? null : Number(s.statement_total);
    const meta: Record<string, any> = {};
    if (s.account_number) meta.account_number = s.account_number;
    if (s.consumption) meta.consumption = s.consumption;
    if(s.statement_check)meta.statement_check=s.statement_check;
    if(s.service_address)meta.service_address=s.service_address;
    if(match.kind==='question')meta.bani_question=`${s.vendor_name}: create this new supplier?`;
    if(match.kind==='company'&&s.account_number)meta.bani_question=`${s.vendor_name} · a/c ${s.account_number}: which venues does it cover?`;
    setEditing(null);
    setHeader({
      supplier_id: matched?.id || null,
      supplier_account_id:match.kind==='account'?match.account_id:null,
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
        supplier_account_id:allMeters.find(m=>m.supplier_id===matched?.id&&normAcct(m.account_number)===normAcct(('account_number' in a?String(a.account_number):'')||s.account_number))?.id??null,
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
    if (splitDraft.mode==='split'&&!splitDraft.balanced){toast.error('Venue split is not balanced');return;}
    setBusy(true);
    try {
      if(editing?.recurring_rule_id&&!header.attachment_path&&!header.attachment_url){
        if(!tenantId)return;
        const {data:rule,error:ruleError}=await supabase.from('expense_recurring_rules').select('is_contract,billed_when').eq('id',editing.recurring_rule_id).eq('tenant_id',tenantId).single();
        if(ruleError){toast.error('Could not check the regular bill rule. Please try again.');return;}
        if(rule.billed_when!=='advance'&&usesContractBillApproval(rule.is_contract,header.attachment_path,header.attachment_url)){
          const {error}=await supabase.rpc('expense_contract_bill_approve',{p_bill:editing.id});if(error)toast.error(error.message);else{toast.success('Contract accrual booked; bill retained unchanged');setEditorOpen(false);}return;
        }
      }
      // Save corrections first in review state; approval and posting are one transaction.
      const id = await saveBill({...header, approval_status:'pending_review'}, allocations);
      if (!id) return;
      if (tenantId) await saveVenueSplit({tenantId,ownerType:'expense_bill',ownerId:id,mode:splitDraft.mode,lines:splitDraft.lines,baseAmount:Number(header.total_amount||0)});
      if(allocations.some(a=>a.capitalize)||header.recurring_rule_id){toast.success('Bill saved for monthly approval');setEditorOpen(false);return;}
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
          <QuickFilter label="Bills" value={statusFilter} onChange={setStatusFilter} options={[{key:'all',label:'All'},{key:'waiting',label:'Waiting for you'},{key:'to-pay',label:'To pay'},{key:'paid',label:'Paid'}]}/>
          <Toolbar search={search} onSearch={setSearch} placeholder="Search bills" mobileSearchBelow searchAfterControls filter={<FilterPanel activeCount={Number(vendorFilter!=='mtd')+Number(categoryFilter!=='mtd')} onReset={()=>{setVendorFilter('mtd');setCategoryFilter('mtd');}} resultLabel={`Show ${filtered.length} bills`}><FilterGroup title="Venue"><span className="text-sm">{scope.label}</span></FilterGroup><FilterGroup title="Vendor"><Select value={vendorFilter} onValueChange={setVendorFilter}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All vendors</SelectItem>{suppliers.map(s=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></FilterGroup><FilterGroup title="Category"><Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{categories.map(c=><SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent></Select></FilterGroup></FilterPanel>} onDownload={()=>downloadCSV(filtered.map(b=>({date:b.bill_date,vendor:b.vendor_name,amount:b.total_amount,status:expenseStatus(b)})),[{key:'date',label:'Date'},{key:'vendor',label:'From'},{key:'amount',label:'Amount'},{key:'status',label:'Status'}],'expenses')}/>
          <form className="flex gap-2" onSubmit={e=>{e.preventDefault();void askBani();}}><Input aria-label="Ask Bani about expenses" placeholder="Ask Bani" value={ask} onChange={e=>setAsk(e.target.value)}/><Button variant="outline" type="submit">Ask</Button></form>
          {answer&&<p className="text-sm">{answer}</p>}
          {bulk&&<div className="border border-border rounded-lg p-3 space-y-2"><p className="font-medium">Approve {bulk.length} bills · {formatCurrency(bulk.reduce((n,b)=>n+b.total_amount,0))}</p>{bulk.map(b=><p key={b.id} className="text-sm">{b.vendor_name} · {formatDate(b.bill_date)} · {formatCurrency(b.total_amount)}</p>)}<div className="flex gap-2"><Button disabled={!canWrite||busy} onClick={async()=>{setBusy(true);let n=0;for(const b of bulk){if(await postBill(b.id))n++;else break;}setBusy(false);setBulk(null);setAnswer(`${n} bills booked.`);}}>Confirm</Button><Button variant="outline" onClick={()=>setBulk(null)}>Cancel</Button></div></div>}
        </div>
        {loading?<p className="p-5 text-muted-foreground">Loading bills…</p>:<><table className="hidden md:table w-full table-fixed text-sm"><thead className="border-y border-border text-muted-foreground text-xs"><tr><th className="text-left px-5 py-3 w-[18%]">Date</th><th className="text-left px-3 w-[42%]">From</th><th className="text-right px-3 w-[18%]">Amount</th><th className="text-left px-5">Status</th></tr></thead><tbody>{filtered.map(b=><tr key={b.id} className="border-b border-border/50 cursor-pointer hover:bg-muted/30" onClick={()=>openEditor(b)}><td className="px-5 py-3">{formatDate(b.bill_date)}</td><td className="px-3 break-words"><SupplierNameLink id={b.supplier_id}>{supplierName(b.supplier_id)!=='—'?supplierName(b.supplier_id):b.vendor_name}</SupplierNameLink><p className="text-xs text-muted-foreground">{b.notes||lineIndex[b.id]?.join(', ')||b.bill_number||'Bill'} · {b.venue||'Unassigned venue'}</p></td><td className="px-3 td-num text-right">{formatCurrency(b.total_amount)}</td><td className="px-5">{expenseStatus(b)}</td></tr>)}</tbody></table><div className="md:hidden divide-y divide-border">{filtered.map(b=><Button key={b.id} variant="ghost" className="w-full h-auto block text-left whitespace-normal rounded-none p-4" onClick={()=>openEditor(b)}><div className="flex justify-between gap-3"><span className="min-w-0 break-words"><SupplierNameLink id={b.supplier_id}>{b.vendor_name||supplierName(b.supplier_id)}</SupplierNameLink></span><span className="td-num shrink-0">{formatCurrency(b.total_amount)}</span></div><p className="text-xs text-muted-foreground mt-1">{b.notes||lineIndex[b.id]?.join(', ')||'Bill'} · {b.venue||'Unassigned venue'}</p><p className="text-xs mt-2">{formatDate(b.bill_date)} · {expenseStatus(b)}</p></Button>)}</div>{!filtered.length&&<p className="p-8 text-center text-muted-foreground">No bills in this view.</p>}</>}
        <CashBoxReceipts inPeriod={period.inPeriod} search={search} only={cashBoxOnly} status={statusFilter}/>
        {statements.statements.filter(s=>period.inPeriod(s.statement_date)&&scope.includesId(s.venue_id)&&(vendorFilter==='all'||s.supplier_id===vendorFilter)&&`${s.vendor_name} ${s.notes}`.toLowerCase().includes(search.toLowerCase())).map(s=><Button key={s.id} variant="ghost" className="w-full h-auto flex justify-between text-left whitespace-normal rounded-none p-4 border-t border-border" onClick={()=>setStatementDoc(s)}><span className="break-words">{s.vendor_name}<span className="block text-xs text-muted-foreground">Statement document · {formatDate(s.statement_date)}</span></span><span className="shrink-0 text-xs">Document</span></Button>)}
      </section>
      <Dialog open={scanOpen} onOpenChange={setScanOpen}><DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Scan or upload</DialogTitle></DialogHeader><BillDropZone onParsed={handleScanned}/><Button variant="outline" onClick={()=>{setScanOpen(false);void openEditor(null);}}>Type a bill</Button></DialogContent></Dialog>
      <Dialog open={!!statementDoc} onOpenChange={o=>!o&&setStatementDoc(null)}><DialogContent><DialogHeader><DialogTitle>Statement · {statementDoc?.vendor_name}</DialogTitle></DialogHeader><p>{statementDoc?.notes||'Statement document'}</p>{statementDoc?.attachment_url&&<a className="text-primary underline" href={statementDoc.attachment_url} target="_blank" rel="noreferrer">View attachment</a>}<p className="text-xs text-muted-foreground">Statement balances are not counted as new bills.</p></DialogContent></Dialog>
      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Link categories to accounts</DialogTitle></DialogHeader>{missingCategories.map(c=><div key={c.id} className="space-y-1"><Label>{c.name}</Label><Select value={categoryLinks[c.id]||'none'} onValueChange={v=>setCategoryLinks(p=>({...p,[c.id]:v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Pick an account</SelectItem>{accounts.map(a=><SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent></Select>{c.name==='Equipment'&&<p className="text-xs text-muted-foreground">Operating supplies by default. Choose 1520 Kitchen Equipment for a qualifying asset; the asset threshold has not been supplied.</p>}</div>)}<DialogFooter><Button variant="outline" onClick={()=>setCategoryOpen(false)}>Cancel</Button><Button disabled={!canWrite||busy||missingCategories.some(c=>!categoryLinks[c.id]||categoryLinks[c.id]==='none')} onClick={async()=>{if(!tenantId)return;setBusy(true);const {error}=await supabase.rpc('approve_expense_category_accounts',{p_tenant:tenantId,p_links:missingCategories.map(c=>({category_id:c.id,account_id:categoryLinks[c.id]}))});setBusy(false);if(error)toast.error(error.message);else{setCategories(p=>p.map(c=>({...c,default_account_id:categoryLinks[c.id]||c.default_account_id})));setCategoryOpen(false);toast.success('Category accounts linked');}}}>Approve</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="kit sales-day-dialog max-w-[760px] grid-cols-[minmax(0,1fr)] p-5 sm:p-7 gap-0 w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] rounded-lg overflow-y-auto overflow-x-hidden">
          <BillReadDetails header={header} setHeader={setHeader} allocations={allocations} setAllocations={setAllocations} suppliers={suppliers} supplierAccounts={allMeters.filter(m=>m.supplier_id===header.supplier_id)} accounts={accounts} venues={venues} canWrite={canWrite} busy={busy} onApprove={handlePost} onPay={()=>{if(!editing)return;setPayForm({...payForm,amount:String(editing.total_amount-editing.paid_amount)});setPayDialogOpen(true);}} onVoid={async()=>{const ok=await confirm({title:"Void this bill?",description:"The draft stays in the audit record and is excluded from totals.",confirmLabel:"Void bill"});if(ok)await handleSave("void");}} onAttach={()=>{setEditorOpen(false);setScanOpen(true);}}/>
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
