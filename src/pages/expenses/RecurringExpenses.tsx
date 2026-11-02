import {RegularCostsApproval} from "@/components/expenses/RegularCostsApproval";
import {ContractPostingPlan} from "@/components/expenses/ContractPostingPlan";
import BillDropZone from "@/components/finance/bills/BillDropZone";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageTop } from "@/components/kit/PageTop";
import { useExpenseBills } from "@/hooks/useExpenseBills";
import { usePagePeriod } from "@/hooks/usePagePeriod";
import { useVenueScope } from "@/hooks/useVenueScope";
import { regularBillGroups, isWaitingBill } from "@/utils/expenses";
import { formatCurrency, formatMonthLabel, formatDate } from "@/utils/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, PlayCircle, Repeat, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useRecurringExpenses, RecurringRule, RecurringRuleStatus } from "@/hooks/useRecurringExpenses";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { supabase } from "@/integrations/supabase/client";
import {
  PageHeader,
  StatusPill,
  StatusVariant,
  TableSkeleton,
  EmptyState,
  KpiGrid,
  KpiCard,
  KpiSkeleton,
  fmtHK,
  fmtHKWhole,
  fmtDate,
  ScopeLine,
  useConfirm,
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
  const { bills, fetchAllocations } = useExpenseBills();
  const scope=useVenueScope(), period=usePagePeriod(bills.map(b=>b.bill_date),"mtd","month",{hints:Object.fromEntries([...new Set(bills.map(b=>b.bill_date.slice(0,7)))].map(k=>[k,`${bills.filter(b=>b.bill_date.startsWith(k)&&isWaitingBill(b)).length} waiting`]))});
  const { tenantId } = useActiveTenant();
  const { rules, save, remove, setStatus, generateNow, loading } = useRecurringExpenses();
  const year=Number(period.month.slice(0,4));
  const detected=regularBillGroups(bills.filter(b=>scope.includesId(b.venue_id))).filter(g=>!rules.some(r=>r.supplier_id===g.rows[0].supplier_id&&r.venue_id===g.rows[0].venue_id));
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [detailsOpen,setDetailsOpen]=useState(false),[uploadOpen,setUploadOpen]=useState(false),[readTerms,setReadTerms]=useState<Partial<RecurringRule>|null>(null);
  const [editing, setEditing] = useState<Partial<RecurringRule>>({});
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      // Server-side tenant filter on every lookup (defence-in-depth beyond RLS).
      const [s, v, c, a] = await Promise.all([
        supabase.from("suppliers").select("id,name").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
        supabase.from("venues").select("id,name").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
        supabase.from("expense_categories").select("id,name").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
        supabase.from("chart_of_accounts").select("id,code,name").eq("tenant_id", tenantId).order("code"),
      ]);
      setSuppliers((s.data || []) as any);
      setVenues((v.data || []) as any);
      setCategories((c.data || []) as any);
      setAccounts((a.data || []) as any);
    })();
  }, [tenantId]);

  const openNew = () => {
    setEditing({
      cadence: "monthly",
      currency: "HKD",
      status: "draft",
      active: false,
      auto_approve: false,
      is_contract:true,direction:"cost",billed_when:"arrears",central_share_method:"sales",
      expected_amount: 0,
      effective_from: new Date().toISOString().slice(0, 10),
    });
    setDetailsOpen(true);setUploadOpen(false);setOpen(true);
  };

  const setField = (k: keyof RecurringRule, v: any) => setEditing((p) => ({ ...p, [k]: v }));

  const previewNextGen = useMemo(() => computeNextGeneration(editing), [editing]);

  const handleSave = async () => {
    if (!editing.name) { toast.error("Name is required"); return; }
    // Cannot save without a category + debit account — otherwise the rule generates
    // orphan bills that stall in Pending Review.
    if (!editing.category_id) { toast.error("Category is required"); return; }
    if (!editing.account_id) { toast.error("Debit account is required"); return; }
    const confirmed=await confirm({title:editing.id?"Confirm regular bill changes":"Add as regular bill",description:`${editing.vendor_name||"Vendor"} · ${editing.name} · ${formatCurrency(Number(editing.expected_amount||0))} · ${editing.cadence||"monthly"}`,confirmLabel:"Confirm"});
    if(!confirmed)return;
    const ok = await save({...editing,auto_approve:false});
    if (ok) setOpen(false);
  };

  const [search, setSearch] = useState("");
  const activeCount = rules.filter((r) => r.status === "active" && (!r.venue_id?scope.isAll:scope.includesId(r.venue_id))).length;
  const monthlyExpected = rules
    .filter((r) => r.status === "active")
    .reduce((s, r) => {
      const amt = Number(r.expected_amount || 0);
      const mult = r.cadence === "weekly" ? 4.33 : r.cadence === "quarterly" ? 1 / 3 : r.cadence === "yearly" ? 1 / 12 : 1;
      return s + amt * mult;
    }, 0);
  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase();
    const scoped=rules.filter(r=>!r.venue_id?scope.isAll:scope.includesId(r.venue_id));
    if (!q) return scoped;
    return scoped.filter((r) =>
      [r.name, r.vendor_name, r.cadence, r.department].some((x) => (x || "").toLowerCase().includes(q))
    );
  }, [rules, search,scope]);

  const historyFor=(r:RecurringRule)=>bills.filter(b=>(b.recurring_rule_id===r.id||b.supplier_id===r.supplier_id)&&(r.combined_venues||b.venue_id===r.venue_id)&&!["void","reversed","rejected"].includes(b.approval_status)).sort((a,b)=>a.bill_date.localeCompare(b.bill_date));
  const yearFacts=(r:RecurringRule)=>{
    const year=period.fromIso?Number(period.fromIso.slice(0,4)):new Date().getFullYear(); const history=historyFor(r).filter(b=>b.bill_date.startsWith(String(year))); const months=[...new Set(history.map(b=>b.bill_date.slice(0,7)))]; const last=history.at(-1),previous=history.at(-2);
    const facts=[months.length?`${months.map(m=>formatMonthLabel(m).split(' ')[0]).join(', ')} received`:'None received this year',`${history.filter(isWaitingBill).length} waiting for you`];
    if(last&&last.bill_date.slice(0,7)<new Date().toISOString().slice(0,7))facts.push(`none since ${formatMonthLabel(last.bill_date.slice(0,7))}`);
    if(last&&previous&&previous.total_amount>0&&last.total_amount>previous.total_amount)facts.push(`${formatMonthLabel(last.bill_date.slice(0,7))} ${formatCurrency(last.total_amount)}, ${Math.round((last.total_amount/previous.total_amount-1)*100)}% above ${formatMonthLabel(previous.bill_date.slice(0,7))}`);
    return facts.join(' · ');
  };
  const usual=(r:RecurringRule)=>{const amounts=historyFor(r).map(b=>b.total_amount);return amounts.length?(Math.min(...amounts)===Math.max(...amounts)?formatCurrency(amounts[0]):`${formatCurrency(Math.min(...amounts))} – ${formatCurrency(Math.max(...amounts))}`):formatCurrency(r.expected_amount);};
  return (
    <div className="w-full min-w-0 space-y-5 pb-24">
      <PageTop title="Regular bills" titleDetail={<span className="text-sm text-muted-foreground">{filteredRules.length+detected.length} regular costs · {formatCurrency(monthlyExpected)} a month</span>} period={period.control} actionsBesideTitle actions={<Button onClick={openNew}><Plus className="h-4 w-4"/>Add contract</Button>}/>
      <RegularCostsApproval bills={bills} month={period.month}/>
      <section className="kit card-glass rounded-xl p-3 sm:p-4 min-w-0 overflow-hidden">{loading?<TableSkeleton rows={4} cols={5}/>:<div className="overflow-x-auto"><Table className="min-w-[680px] w-full"><TableHeader><TableRow><TableHead>Regular cost</TableHead><TableHead>Covers</TableHead><TableHead>Usually</TableHead><TableHead>This year</TableHead><TableHead>Now</TableHead></TableRow></TableHeader><TableBody><TableRow className="bg-muted/40"><TableCell colSpan={5}>From contracts</TableCell></TableRow>{filteredRules.map(r=><TableRow key={r.id} className="cursor-pointer" onClick={()=>{setEditing(r);setDetailsOpen(false);setUploadOpen(false);setOpen(true);}}><TableCell>{/rent/i.test(r.name)?'Rent':r.name}<p className="text-xs text-muted-foreground">{r.vendor_name}</p></TableCell><TableCell>{venues.find(v=>v.id===r.venue_id)?.name||'Central · by sales'}</TableCell><TableCell className="td-num">{formatCurrency(r.expected_amount)}<p className="text-xs text-muted-foreground">{r.cadence}</p></TableCell><TableCell className="min-w-40"><ContractPostingPlan rule={r} bills={bills} year={year} compact/></TableCell><TableCell className="text-xs">{yearFacts(r)}</TableCell></TableRow>)}<TableRow className="bg-muted/40"><TableCell colSpan={5}>From bills</TableCell></TableRow>{detected.map(g=>{const b=g.rows.at(-1);if(!b)return null;return <TableRow key={g.key}><TableCell>{b.vendor_name}<p className="text-xs text-muted-foreground">{b.supplier_account_id?'Supplier account':'Regular bill'}</p></TableCell><TableCell>{b.venue||'Covers not set'}</TableCell><TableCell className="td-num">{formatCurrency(b.total_amount)}<p className="text-xs text-muted-foreground">Usually monthly</p></TableCell><TableCell><div className="grid grid-cols-12 gap-1">{Array.from({length:12},(_,i)=>{const k=`${year}-${String(i+1).padStart(2,'0')}`,bs=g.rows.filter(b=>(b.period_start??b.bill_date).startsWith(k));return <div key={k} title={formatMonthLabel(k)} className={`h-3 rounded-sm ${bs.some(b=>b.approval_status==='posted')?'bg-primary':bs.length?'bg-warning/30':'bg-muted'}`}/>;})}</div></TableCell><TableCell className="text-xs">{g.rows.filter(isWaitingBill).length} waiting</TableCell></TableRow>;})}</TableBody></Table></div>}</section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={detailsOpen||uploadOpen?"max-w-[460px] max-h-[85dvh] overflow-y-auto":"max-w-[460px] overflow-hidden"}>
          <DialogHeader><DialogTitle>{/rent/i.test(editing.name??'')?'Rent':editing.name||'New contract'}</DialogTitle><p className="text-sm text-muted-foreground">{editing.vendor_name||'Supplier'} · lease · {venues.find(v=>v.id===editing.venue_id)?.name||'Central'}</p></DialogHeader>
          {!detailsOpen&&!uploadOpen?<div className="space-y-5"><p className="text-3xl td-num">{formatCurrency(Number(editing.expected_amount??0)/(editing.cadence==='quarterly'?3:editing.cadence==='yearly'?12:1))}<span className="block text-sm text-muted-foreground">a month</span></p><ContractPostingPlan rule={editing} bills={bills} year={year}/><div className="flex gap-4"><Button variant="link" className="p-0 h-auto" onClick={()=>setDetailsOpen(true)}>Details</Button><Button variant="link" className="p-0 h-auto" onClick={async()=>{if(editing.attachment_path){const {data,error}=await supabase.storage.from('bill-attachments').createSignedUrl(editing.attachment_path,3600);if(error||!data){toast.error("File can't be opened right now");return;}window.open(data.signedUrl,'_blank','noopener,noreferrer');}else setUploadOpen(true);}}>{editing.attachment_path?'View lease':'Upload lease'}</Button>{editing.attachment_path&&<Button variant="link" className="p-0 h-auto" onClick={()=>setUploadOpen(true)}>Upload lease</Button>}</div></div>:uploadOpen?<div className="space-y-4">{readTerms?<><p className="text-sm">{formatCurrency(Number(readTerms.expected_amount??0))} · {readTerms.cadence} · {readTerms.effective_from?formatDate(readTerms.effective_from):'Start not read'} – {readTerms.contract_end?formatDate(readTerms.contract_end):'End not read'} · rent-free {(readTerms.rent_free_months??[]).join(', ')||'not read'} · {(readTerms.step_increases??[]).map(s=>`${formatCurrency(s.amount)} from ${s.month}`).join(' · ')||'increases not read'} · deposit {formatCurrency(Number(readTerms.deposit_amount??0))}</p><div className="flex gap-2"><Button onClick={async()=>{const next={...editing,...readTerms,auto_approve:false};if(!next.attachment_path){toast.error('Lease file was not stored; please retry');return;}if(await save(next)){setEditing(next);setReadTerms(null);setUploadOpen(false);}}}>Confirm</Button><Button variant="outline" onClick={()=>{setEditing(p=>({...p,...readTerms}));setReadTerms(null);setUploadOpen(false);setDetailsOpen(true);}}>Change</Button></div></>:<BillDropZone onParsed={s=>{const c=(s as any).contract_terms??{};setReadTerms({expected_amount:c.amount??s.total_amount,cadence:c.cadence||editing.cadence,direction:c.direction||editing.direction,billed_when:c.billed_when||editing.billed_when,effective_from:c.start||s.service_period_start||editing.effective_from,contract_end:c.end||s.service_period_end||editing.contract_end,payment_due_day:c.due_day??editing.payment_due_day,rent_free_months:c.rent_free_months??editing.rent_free_months,step_increases:c.step_increases??editing.step_increases,deposit_amount:c.deposit_amount??editing.deposit_amount,attachment_url:s.attachment_url,attachment_path:s.attachment_path});}}/>}<Button variant="ghost" onClick={()=>setUploadOpen(false)}>Back</Button></div>:<div className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-3"><div><Label>Direction</Label><Select value={editing.direction||'cost'} onValueChange={v=>setField('direction',v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="cost">Cost</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent></Select></div><div><Label>Billed</Label><Select value={editing.billed_when||'arrears'} onValueChange={v=>setField('billed_when',v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="arrears">In arrears</SelectItem><SelectItem value="advance">In advance</SelectItem></SelectContent></Select></div><div><Label>Contract end</Label><Input type="date" value={editing.contract_end||''} onChange={e=>setField('contract_end',e.target.value)}/></div><div><Label>Deposit</Label><Input type="number" value={editing.deposit_amount??0} onChange={e=>setField('deposit_amount',Number(e.target.value))}/></div><div className="col-span-2"><Label>Rent-free months (YYYY-MM, separated by commas)</Label><Input value={(editing.rent_free_months??[]).join(',')} onChange={e=>setField('rent_free_months',e.target.value.split(',').map(v=>v.trim()).filter(v=>/^\d{4}-\d{2}$/.test(v)))}/></div><div className="col-span-2"><Label>Fixed increases</Label>{(editing.step_increases??[]).map((step,i)=><div className="flex gap-2 mt-2" key={i}><Input type="month" value={step.month} onChange={e=>setField('step_increases',(editing.step_increases??[]).map((s,j)=>j===i?{...s,month:e.target.value}:s))}/><Input type="number" value={step.amount} onChange={e=>setField('step_increases',(editing.step_increases??[]).map((s,j)=>j===i?{...s,amount:Number(e.target.value)}:s))}/></div>)}<Button variant="outline" size="sm" onClick={()=>setField('step_increases',[...(editing.step_increases??[]),{month:'',amount:0}])}>Add increase</Button></div></div>

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
                    <SelectItem value="__combined__">Central · shared by sales</SelectItem>
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
            </div>
            <details><summary className="text-sm cursor-pointer">More</summary><div className="rounded-lg border border-dashed border-muted-foreground/25 p-4 space-y-3">
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
            </details><div>
              <Label>Notes</Label>
              <Textarea value={editing.notes || ""} onChange={(e) => setField("notes", e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>Confirm</Button>
            </div>
          </div>}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
