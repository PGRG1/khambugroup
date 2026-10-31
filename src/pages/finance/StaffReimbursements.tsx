import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Wallet, ExternalLink, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  PageHeader, KpiCard, KpiGrid, StatusPill, fmtHK, fmtHKWhole, fmtDate,
} from "@/components/expenses/shared";
import {
  useStaffReimbursements, type StaffReimbursement,
} from "@/hooks/useStaffReimbursements";
import ReimbursementAiImport from "@/components/staff-reimbursements/ReimbursementAiImport";

import { PageTop } from "@/components/kit/PageTop";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import { useVenueScope } from "@/hooks/useVenueScope";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useAuth } from "@/hooks/useAuth";
import { claimChecks } from "@/utils/expenses";
import { formatCurrency, formatDate } from "@/utils/format";
import { QuickFilter } from "@/components/kit/QuickFilter";
import { Toolbar } from "@/components/kit/Toolbar";

type StatusFilter = "all" | "owing" | "paid";

export default function StaffReimbursements() {
  const sr = useStaffReimbursements();
  const period=usePeriodFilter(sr.reimbursements.map(r=>r.claim_date),"all"), scope=useVenueScope();
  const {user}=useAuth(); const {isPreviewActive}=usePreviewMode();
  const [owner,setOwner]=useState(false),[review,setReview]=useState<StaffReimbursement|null>(null),[payout,setPayout]=useState("bank"),[approving,setApproving]=useState(false);
  useEffect(()=>{if(sr.tenantId&&user)supabase.rpc("people_owner",{t:sr.tenantId,u:user.id}).then(({data})=>setOwner(data===true));},[sr.tenantId,user]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<StaffReimbursement | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sr.reimbursements.filter(r => {
      if (!period.inPeriod(r.claim_date)||!scope.includesId(r.venue_id)) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return `${r.claimant_name} ${r.description} ${r.amount}`.toLowerCase().includes(q);
    });
  }, [sr.reimbursements, statusFilter, search, period, scope]);
  const statusWords=(r:StaffReimbursement)=>r.status==='paid'?'Paid':r.approval_status==='pending_review'?(r.amount>300?'Waiting for owner (over HK$300)':'Waiting for manager'):`Approved · pay with ${r.payout_method==='petty_cash'?'cash box':r.payout_method||'bank'}`;
  return (
    <div className="w-full min-w-0 space-y-5 pb-24">
      <PageTop title="Staff claims" period={period.control} actionsBesideTitle actions={<Button onClick={()=>setAiOpen(true)}><Sparkles className="h-4 w-4"/>Scan or upload</Button>}/>
      <section className="kit card-glass overflow-hidden"><div className="p-4 sm:p-5 space-y-3"><h2 className="text-base font-semibold">{period.label} · {rows.length} claims</h2><p className="text-sm text-muted-foreground">{formatCurrency(rows.reduce((n,r)=>n+r.amount,0))} · {rows.filter(r=>r.approval_status==='pending_review').length} waiting for approval</p><QuickFilter<StatusFilter> value={statusFilter} onChange={setStatusFilter} options={[{key:'all',label:'All'},{key:'owing',label:'To pay'},{key:'paid',label:'Paid'}]}/><Toolbar search={search} onSearch={setSearch} placeholder="Search claims" columns={<Button variant="outline" onClick={()=>setAddOpen(true)}><Plus className="h-4 w-4"/>Add claim</Button>}/></div>
      <table className="hidden md:table w-full table-fixed text-sm"><thead className="border-y border-border text-muted-foreground text-xs"><tr><th className="px-5 py-3 text-left w-[20%]">Person</th><th className="text-left px-3 w-[35%]">What for</th><th className="text-right px-3 w-[18%]">Amount</th><th className="text-left px-5">Status</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-b border-border/50 cursor-pointer hover:bg-muted/30" onClick={()=>setReview(r)}><td className="px-5 py-3 break-words">{r.claimant_name}</td><td className="px-3 break-words">{r.description}<p className="text-xs text-muted-foreground">{formatDate(r.claim_date)}</p></td><td className="text-right px-3 td-num">{formatCurrency(r.amount)}</td><td className="px-5">{statusWords(r)}</td></tr>)}</tbody></table><div className="md:hidden divide-y divide-border">{rows.map(r=><Button key={r.id} variant="ghost" className="w-full h-auto block text-left whitespace-normal p-4 rounded-none" onClick={()=>setReview(r)}><div className="flex justify-between gap-3"><span>{r.claimant_name}</span><span className="td-num shrink-0">{formatCurrency(r.amount)}</span></div><p className="text-xs text-muted-foreground mt-1">{r.description} · {formatDate(r.claim_date)}</p><p className="text-xs mt-2">{statusWords(r)}</p></Button>)}</div>{!rows.length&&<p className="p-8 text-center text-muted-foreground">{sr.loading?'Loading claims…':'No claims in this view.'}</p>}</section>
      <Dialog open={!!review} onOpenChange={o=>!o&&setReview(null)}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{review?.claimant_name} · Staff claim</DialogTitle></DialogHeader>{review&&<><p>{review.description} · {formatCurrency(review.amount)}</p><p className="text-sm">{statusWords(review)}</p>{[...new Set([...claimChecks(review,sr.reimbursements,new Date().toISOString().slice(0,10)),...(review.review_reasons??[])])].map(reason=><p key={reason} className="text-sm text-warning">{reason}</p>)}{review.receipt_url&&<a className="text-primary underline" href={review.receipt_url} target="_blank" rel="noreferrer">View receipt</a>}{review.approval_status==='pending_review'&&<><Label>Pay with</Label><Select value={payout} onValueChange={setPayout}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="bank">Bank</SelectItem><SelectItem value="payroll">Payroll</SelectItem><SelectItem value="petty_cash">Cash box</SelectItem></SelectContent></Select><DialogFooter><Button disabled={isPreviewActive||approving||(review.amount>300&&!owner)} onClick={async()=>{setApproving(true);try{await sr.approveClaim(review.id,payout);toast.success('Claim approved and booked');setReview(null);}catch(e){toast.error(e instanceof Error?e.message:'Approval failed');}finally{setApproving(false);}}}>Approve</Button></DialogFooter></>}{review.approval_status==='approved'&&review.status==='owing'&&<Button disabled={isPreviewActive} onClick={()=>{setPayOpen(review);setReview(null);}}>Mark as paid</Button>}</>}</DialogContent></Dialog>

      <AddClaimDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        sr={sr}
      />
      <MarkPaidDialog
        claim={payOpen}
        onOpenChange={(o) => { if (!o) setPayOpen(null); }}
        sr={sr}
      />
      <ReimbursementAiImport
        open={aiOpen}
        onOpenChange={setAiOpen}
        sr={sr}
      />
    </div>
  );
}

/* ------------------------------------------------------------- */
/* Add Claim dialog                                              */
/* ------------------------------------------------------------- */
function AddClaimDialog({
  open, onOpenChange, sr,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sr: ReturnType<typeof useStaffReimbursements>;
}) {
  const [claimant, setClaimant] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setClaimant(""); setDescription(""); setCategoryId("");
    setAmount(""); setDate(new Date().toISOString().slice(0, 10)); setFile(null);
  };

  const canSubmit =
    claimant.trim() && description.trim() && categoryId &&
    amount && Number(amount) > 0 && date;

  const submit = async () => {
    if (!canSubmit || !sr.tenantId) return;
    setSaving(true);
    try {
      let receipt_url: string | null = null;
      let receipt_path: string | null = null;
      if (file) {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (uid) {
          const path = `staff-reimbursements/${uid}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
          const { error: upErr } = await supabase.storage.from("petty-cash-receipts").upload(path, file);
          if (upErr) throw upErr;
          receipt_path = path;
          const { data: signed } = await supabase.storage.from("petty-cash-receipts").createSignedUrl(path, 60 * 60 * 24 * 365);
          receipt_url = signed?.signedUrl ?? null;
        }
      }

      const receipt_hash = file ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()))).map(b=>b.toString(16).padStart(2,"0")).join("") : null;
      await sr.createClaim({
        claimant_name: claimant,
        description,
        category_id: categoryId,
        amount: Number(amount),
        claim_date: date,
        receipt_url,
        receipt_path,
        receipt_hash,
      });
      toast.success("Claim saved — waiting for approval");
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to record claim");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add Reimbursement Claim</DialogTitle>
          <DialogDescription>
            Saves the claim for review before approval and booking.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs">Claimant name</Label>
            <Input value={claimant} onChange={e => setClaimant(e.target.value)} placeholder="e.g. Marcus Wong" />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What did they pay for?"
            />
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {sr.classifications.filter(c => c.is_active).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Amount (HK$)</Label>
            <Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Claim date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Receipt (optional)</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving ? "Saving…" : "Record claim"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------- */
/* Mark Paid dialog                                              */
/* ------------------------------------------------------------- */
function MarkPaidDialog({
  claim, onOpenChange, sr,
}: {
  claim: StaffReimbursement | null;
  onOpenChange: (o: boolean) => void;
  sr: ReturnType<typeof useStaffReimbursements>;
}) {
  const [paidFrom, setPaidFrom] = useState<"bank" | "petty_cash" | "payroll">("bank");
  const [bankId, setBankId] = useState<string>("");
  const [floatId, setFloatId] = useState<string>("");
  const [paidDate, setPaidDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  if (!claim) return null;

  const canSubmit =
    paidDate &&
    ((paidFrom === "bank" && bankId) ||
      (paidFrom === "petty_cash" && floatId));

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await sr.markAsPaid(claim, {
        paid_from: paidFrom,
        paid_date: paidDate,
        bank_account_id: paidFrom === "bank" ? bankId : null,
        float_id: paidFrom === "petty_cash" ? floatId : null,
      });
      toast.success("Payment recorded");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!claim} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Mark as Paid</DialogTitle>
          <DialogDescription>
            Settling {fmtHK(Number(claim.amount))} owed to <strong>{claim.claimant_name}</strong>.
            Posts a payment journal (Dr Payable, Cr chosen source).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Paid from</Label>
            <div className="flex gap-1.5 mt-1">
              {(["bank", "petty_cash", "payroll"] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  disabled={v === "payroll"}
                  onClick={() => setPaidFrom(v)}
                  className={
                    "flex-1 px-3 h-9 rounded-md text-xs font-medium capitalize border transition-colors " +
                    (v === "payroll" ? "opacity-40 cursor-not-allowed " : "") +
                    (paidFrom === v && v !== "payroll"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent border-border/60 hover:border-border")
                  }
                >
                  {v === "petty_cash" ? "Petty Cash" : v === "payroll" ? "Payroll (soon)" : "Bank"}
                </button>
              ))}
            </div>
          </div>

          {paidFrom === "bank" && (
            <div>
              <Label className="text-xs">Bank account</Label>
              <Select value={bankId} onValueChange={setBankId}>
                <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
                <SelectContent>
                  {sr.bankAccounts.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.account_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {paidFrom === "petty_cash" && (
            <div>
              <Label className="text-xs">Petty cash float</Label>
              <Select value={floatId} onValueChange={setFloatId}>
                <SelectTrigger><SelectValue placeholder="Select float" /></SelectTrigger>
                <SelectContent>
                  {sr.floats.filter(f => f.is_active).map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name} · {f.venue}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs">Payment date</Label>
            <Input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || saving}>
            {saving ? "Saving…" : "Confirm payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
