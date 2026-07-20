import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { HRPayroll, HREmployee } from "@/hooks/useHRData";
import { usePayrollPaymentBatches } from "@/hooks/usePayrollPaymentBatches";
import { useVenues } from "@/hooks/useVenues";

const UNASSIGNED = "Unassigned";

type Kind = "salary" | "mpf";
type Method = "bank_transfer" | "cash" | "other";

interface BankAcct { id: string; account_name: string; bank_name: string; linked_gl_account_id: string | null }
interface BankTxn { id: string; txn_date: string; description: string; money_out: number; money_in: number; status: string }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  year: number;
  month: number;
  payroll: HRPayroll[];
  employees: HREmployee[];
  onPosted?: () => void;
}

const fmt = (n: number) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MPF_RATE = 0.05;
const MPF_CAP = 1500;

export function PayrollPaymentDialog({ open, onOpenChange, year, month, payroll, employees, onPosted }: Props) {
  const [kind, setKind] = useState<Kind>("salary");
  const [method, setMethod] = useState<Method>("bank_transfer");
  const [bankAcctId, setBankAcctId] = useState<string>("");
  const [bankTxnId, setBankTxnId] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [posting, setPosting] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAcct[]>([]);
  const [bankTxns, setBankTxns] = useState<BankTxn[]>([]);

  const { createAndPost } = usePayrollPaymentBatches(year, month);
  const { venues } = useVenues();
  const venueById = useMemo(() => {
    const m = new Map<string, string>();
    venues.forEach(v => m.set(v.id, v.name));
    return m;
  }, [venues]);
  const venueOrder = useMemo(() => {
    const o = new Map<string, number>();
    venues.forEach((v, i) => o.set(v.name, i));
    return o;
  }, [venues]);
  const resolveVenue = (emp: HREmployee): string => {
    const vid = (emp as any).venue_id as string | null | undefined;
    if (vid && venueById.has(vid)) return venueById.get(vid)!;
    const legacy = (emp.venue || "").trim();
    if (legacy && venueOrder.has(legacy)) return legacy;
    return UNASSIGNED;
  };
  const venueRank = (name: string): number => {
    if (name === UNASSIGNED) return Number.MAX_SAFE_INTEGER;
    return venueOrder.has(name) ? venueOrder.get(name)! : Number.MAX_SAFE_INTEGER - 1;
  };

  useEffect(() => {
    if (!open) return;
    supabase.from("bank_accounts").select("id, account_name, bank_name, linked_gl_account_id").eq("is_active", true).order("sort_order")
      .then(({ data }) => setBankAccounts((data as any) ?? []));
  }, [open]);

  useEffect(() => {
    if (!open || method !== "bank_transfer" || !bankAcctId) { setBankTxns([]); return; }
    supabase.from("bank_transactions").select("id, txn_date, description, money_out, money_in, status")
      .eq("bank_account_id", bankAcctId).neq("status", "matched").order("txn_date", { ascending: false }).limit(50)
      .then(({ data }) => setBankTxns((data as any) ?? []));
  }, [open, method, bankAcctId]);

  // Reset selection when kind changes
  useEffect(() => { setSelected({}); }, [kind, open]);

  // Compute outstanding per payroll row
  const rows = useMemo(() => {
    return payroll.map((p) => {
      const emp = employees.find((e) => e.id === p.employee_id);
      const gross = Number(p.gross_salary || 0);
      const mpfE = Number(p.mpf_employee || Math.min(MPF_CAP, gross * MPF_RATE) || 0);
      const mpfR = Number(p.mpf_employer || Math.min(MPF_CAP, gross * MPF_RATE) || 0);
      const net = Number(p.net_salary || gross - mpfE);
      const totalMpf = mpfE + mpfR;
      const owed = kind === "salary"
        ? Math.max(0, net - Number(p.salary_paid_amount || 0))
        : Math.max(0, totalMpf - Number(p.mpf_paid_amount || 0));
      const venueName = emp ? resolveVenue(emp) : UNASSIGNED;
      return { p, emp, owed, gross, net, totalMpf, venueName };
    }).filter((r) => r.emp).sort((a, b) => {
      const ra = venueRank(a.venueName); const rb = venueRank(b.venueName);
      if (ra !== rb) return ra - rb;
      if (a.venueName !== b.venueName) return a.venueName.localeCompare(b.venueName);
      return (a.emp!.first_name || "").localeCompare(b.emp!.first_name || "");
    });
  }, [payroll, employees, kind, venueById, venueOrder]);

  const total = useMemo(() => rows.filter((r) => selected[r.p.id]).reduce((s, r) => s + r.owed, 0), [rows, selected]);
  const allSelected = rows.length > 0 && rows.every((r) => selected[r.p.id] || r.owed === 0);

  const toggleAll = () => {
    if (allSelected) setSelected({});
    else { const next: Record<string, boolean> = {}; rows.forEach((r) => { if (r.owed > 0) next[r.p.id] = true; }); setSelected(next); }
  };

  const submit = async () => {
    const lines = rows.filter((r) => selected[r.p.id] && r.owed > 0).map((r) => ({ payroll_id: r.p.id, employee_id: r.p.employee_id, amount: r.owed }));
    if (lines.length === 0) return;
    setPosting(true);
    const id = await createAndPost({
      kind, payment_date: paymentDate, payment_method: method,
      bank_account_id: method === "bank_transfer" ? bankAcctId : null,
      bank_transaction_id: method === "bank_transfer" && bankTxnId ? bankTxnId : null,
      lines,
    });
    setPosting(false);
    if (id) { onPosted?.(); onOpenChange(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Payroll Payment — {year}-{String(month).padStart(2, "0")}</DialogTitle>
        </DialogHeader>

        <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
          <TabsList><TabsTrigger value="salary">Salary</TabsTrigger><TabsTrigger value="mpf">MPF</TabsTrigger></TabsList>
          <TabsContent value={kind} className="space-y-4 mt-4">

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Payment date</Label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Method</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {method === "bank_transfer" && (
                <>
                  <div>
                    <Label className="text-xs">Bank account</Label>
                    <Select value={bankAcctId} onValueChange={setBankAcctId}>
                      <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {bankAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id} disabled={!a.linked_gl_account_id}>
                            {a.bank_name} — {a.account_name}{!a.linked_gl_account_id ? " (no GL)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Match bank txn (optional)</Label>
                    <Select value={bankTxnId || "__none"} onValueChange={(v) => setBankTxnId(v === "__none" ? "" : v)} disabled={!bankAcctId}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— None —</SelectItem>
                        {bankTxns.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.txn_date} · {fmt(Number(t.money_out) || Number(t.money_in))} · {t.description.slice(0, 40)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>

            <div className="border border-border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Venue</TableHead>
                    <TableHead className="text-right">{kind === "salary" ? "Net pay" : "Total MPF"}</TableHead>
                    <TableHead className="text-right">Already paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const paid = kind === "salary" ? Number(r.p.salary_paid_amount || 0) : Number(r.p.mpf_paid_amount || 0);
                    const ref = kind === "salary" ? r.net : r.totalMpf;
                    return (
                      <TableRow key={r.p.id} className={r.owed === 0 ? "opacity-50" : ""}>
                        <TableCell><Checkbox disabled={r.owed === 0} checked={!!selected[r.p.id]} onCheckedChange={(c) => setSelected((s) => ({ ...s, [r.p.id]: !!c }))} /></TableCell>
                        <TableCell className="font-medium">
                          <span>{r.emp!.first_name} {r.emp!.last_name}</span>
                          {!["active", "on_leave"].includes(r.emp!.status) && (
                            <span className="ml-1.5 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-muted-foreground font-normal align-middle">inactive</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.venueName}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(ref)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(paid)}</TableCell>
                        <TableCell className="text-right tabular-nums font-bold">{fmt(r.owed)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{Object.values(selected).filter(Boolean).length} employees selected</span>
              <span className="font-bold">Total: {fmt(total)}</span>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={
              posting || total <= 0 ||
              (method === "bank_transfer" && !bankAcctId)
            }
          >
            {posting ? "Posting…" : "Create & Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
