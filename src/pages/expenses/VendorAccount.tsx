import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import SupplierAccountsSection from "@/components/expenses/SupplierAccountsSection";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtMoney = (n: number) => `HK$ ${(Number(n) || 0).toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${String(dt.getDate()).padStart(2, "0")} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
};

function KCard({ label, value, tone = "default", sub }: { label: string; value: string; tone?: "default" | "amber" | "green" | "red" | "sky"; sub?: React.ReactNode }) {
  const toneCls =
    tone === "amber" ? "text-amber-400" :
    tone === "green" ? "text-emerald-400" :
    tone === "red" ? "text-red-400" :
    tone === "sky" ? "text-sky-400" :
    "text-foreground";
  return (
    <Card className="card-glass">
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-semibold td-num ${toneCls}`}>{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

type Bill = { id: string; bill_number: string | null; bill_date: string | null; due_date: string | null; total_amount: number | null; paid_amount: number | null; approval_status: string | null; payment_status: string | null; venue: string | null; notes: string | null; supplier_account_id: string | null };
type Payment = { id: string; bill_id: string; payment_date: string | null; amount: number | null; payment_method: string | null; reference: string | null; notes: string | null };

export default function ExpenseVendorAccountPage() {
  const { vendorId = "" } = useParams<{ vendorId: string }>();
  const { tenantId } = useActiveTenant();
  const [vendorName, setVendorName] = useState("");
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!tenantId || !vendorId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: v }, { data: b }, { data: p }] = await Promise.all([
        (supabase as any).from("suppliers").select("id, name").eq("id", vendorId).eq("tenant_id", tenantId).maybeSingle(),
        (supabase as any).from("expense_bills").select("id, bill_number, bill_date, due_date, total_amount, paid_amount, approval_status, payment_status, venue, notes, supplier_account_id").eq("tenant_id", tenantId).eq("supplier_id", vendorId).order("bill_date", { ascending: false }),
        (supabase as any).from("expense_bill_payments").select("id, bill_id, payment_date, amount, payment_method, reference, notes").eq("tenant_id", tenantId),
      ]);
      if (cancelled) return;
      setVendorName(v?.name || "Vendor");
      const billRows: Bill[] = (b || []) as Bill[];
      const billIds = new Set(billRows.map((r) => r.id));
      setBills(billRows);
      setPayments(((p || []) as Payment[]).filter((r) => billIds.has(r.bill_id)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenantId, vendorId, reloadKey]);

  const billCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const b of bills) {
      if (b.supplier_account_id) m[b.supplier_account_id] = (m[b.supplier_account_id] || 0) + 1;
    }
    return m;
  }, [bills]);

  const scopedBills = useMemo(
    () => (selectedAccountId ? bills.filter((b) => b.supplier_account_id === selectedAccountId) : bills),
    [bills, selectedAccountId],
  );

  const todayStr = new Date().toISOString().slice(0, 10);

  const paidByBill = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments) m.set(p.bill_id, (m.get(p.bill_id) || 0) + (Number(p.amount) || 0));
    return m;
  }, [payments]);

  const activeBills = useMemo(() => scopedBills.filter((b) => b.approval_status !== "voided" && b.approval_status !== "reversed" && b.approval_status !== "draft"), [scopedBills]);
  const scopedPayments = useMemo(() => {
    const ids = new Set(scopedBills.map((b) => b.id));
    return payments.filter((p) => ids.has(p.bill_id));
  }, [scopedBills, payments]);

  const totals = useMemo(() => {
    let billed = 0, paid = 0, outstanding = 0, overdue = 0, openN = 0;
    for (const b of activeBills) {
      const total = Number(b.total_amount) || 0;
      const p = paidByBill.get(b.id) ?? (Number(b.paid_amount) || 0);
      const o = Math.max(0, total - p);
      billed += total; paid += p; outstanding += o;
      if (o > 0.005) { openN += 1; if (b.due_date && b.due_date < todayStr) overdue += o; }
    }
    return { billed, paid, outstanding, overdue, openN };
  }, [activeBills, paidByBill, todayStr]);

  type Entry = { id: string; date: string | null; kind: "bill" | "payment"; reference: string; description: string; debit: number; credit: number; balance?: number };
  const ledger = useMemo<Entry[]>(() => {
    const entries: Entry[] = [];
    for (const b of activeBills) {
      entries.push({
        id: `bill-${b.id}`,
        date: b.bill_date,
        kind: "bill",
        reference: b.bill_number || "—",
        description: `Bill${b.venue ? ` · ${b.venue}` : ""}`,
        debit: Number(b.total_amount) || 0,
        credit: 0,
      });
    }
    for (const p of payments) {
      entries.push({
        id: `pay-${p.id}`,
        date: p.payment_date,
        kind: "payment",
        reference: p.reference || p.payment_method || "—",
        description: `Payment${p.payment_method ? ` — ${p.payment_method}` : ""}`,
        debit: 0,
        credit: Number(p.amount) || 0,
      });
    }
    const sorted = entries.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    let bal = 0;
    return sorted.map((e) => { bal = bal + (e.debit || 0) - (e.credit || 0); return { ...e, balance: bal }; });
  }, [activeBills, payments]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/expenses/finance/vendors"><ArrowLeft className="h-4 w-4 mr-1" />Vendors</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">{vendorName}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Bills, payments, and running balance</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <KCard label="Total billed" value={fmtMoney(totals.billed)} />
        <KCard label="Total paid" value={fmtMoney(totals.paid)} tone="green" />
        <KCard label="Outstanding" value={fmtMoney(totals.outstanding)} tone="amber" />
        <KCard label="Overdue" value={fmtMoney(totals.overdue)} tone="red" />
        <KCard label="Open bills" value={String(totals.openN)} tone="sky" />
      </div>

      <Tabs defaultValue="statement">
        <TabsList>
          <TabsTrigger value="statement">Statement</TabsTrigger>
          <TabsTrigger value="bills">Bills ({activeBills.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="statement">
          <Card className="card-glass">
            <CardContent className="p-5">
              {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : ledger.length === 0 ? (
                <div className="text-sm text-muted-foreground">No activity yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                        <th className="text-left py-2 pr-4">Date</th>
                        <th className="text-left py-2 pr-4">Type</th>
                        <th className="text-left py-2 pr-4">Reference</th>
                        <th className="text-left py-2 pr-4">Description</th>
                        <th className="text-right py-2 pr-4">Charges</th>
                        <th className="text-right py-2 pr-4">Payments</th>
                        <th className="text-right py-2 pr-4">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((e) => (
                        <tr key={e.id} className="border-b border-border/40">
                          <td className="py-2 pr-4">{fmtDate(e.date)}</td>
                          <td className="py-2 pr-4">
                            <Badge variant="outline" className={`text-[10px] ${e.kind === "bill" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "bg-green-500/15 text-green-400 border-green-500/30"}`}>
                              {e.kind === "bill" ? "Bill" : "Payment"}
                            </Badge>
                          </td>
                          <td className="py-2 pr-4 font-mono text-xs">{e.reference}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{e.description}</td>
                          <td className="py-2 pr-4 text-right td-num tabular-nums">{e.debit > 0 ? fmtMoney(e.debit) : "—"}</td>
                          <td className="py-2 pr-4 text-right td-num tabular-nums text-emerald-400">{e.credit > 0 ? fmtMoney(e.credit) : "—"}</td>
                          <td className={`py-2 pr-4 text-right td-num tabular-nums font-semibold ${(e.balance || 0) > 0.005 ? "text-amber-400" : ""}`}>{fmtMoney(e.balance || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bills">
          <Card className="card-glass">
            <CardContent className="p-5">
              {activeBills.length === 0 ? <div className="text-sm text-muted-foreground">No bills.</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                        <th className="text-left py-2 pr-4">Bill #</th>
                        <th className="text-left py-2 pr-4">Bill date</th>
                        <th className="text-left py-2 pr-4">Due date</th>
                        <th className="text-left py-2 pr-4">Venue</th>
                        <th className="text-right py-2 pr-4">Total</th>
                        <th className="text-right py-2 pr-4">Paid</th>
                        <th className="text-right py-2 pr-4">Outstanding</th>
                        <th className="text-left py-2 pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeBills.map((b) => {
                        const paid = paidByBill.get(b.id) ?? (Number(b.paid_amount) || 0);
                        const out = Math.max(0, (Number(b.total_amount) || 0) - paid);
                        return (
                          <tr key={b.id} className="border-b border-border/40">
                            <td className="py-2 pr-4 font-mono text-xs">{b.bill_number || "—"}</td>
                            <td className="py-2 pr-4">{fmtDate(b.bill_date)}</td>
                            <td className="py-2 pr-4">{fmtDate(b.due_date)}</td>
                            <td className="py-2 pr-4">{b.venue || "—"}</td>
                            <td className="py-2 pr-4 text-right td-num tabular-nums">{fmtMoney(Number(b.total_amount) || 0)}</td>
                            <td className="py-2 pr-4 text-right td-num tabular-nums text-muted-foreground">{fmtMoney(paid)}</td>
                            <td className={`py-2 pr-4 text-right td-num tabular-nums ${out > 0 ? "text-amber-400" : "text-muted-foreground/60"}`}>{out > 0 ? fmtMoney(out) : "—"}</td>
                            <td className="py-2 pr-4"><Badge variant="outline" className="text-[10px]">{b.payment_status}</Badge></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card className="card-glass">
            <CardContent className="p-5">
              {payments.length === 0 ? <div className="text-sm text-muted-foreground">No payments.</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                        <th className="text-left py-2 pr-4">Date</th>
                        <th className="text-left py-2 pr-4">Method</th>
                        <th className="text-left py-2 pr-4">Reference</th>
                        <th className="text-right py-2 pr-4">Amount</th>
                        <th className="text-left py-2 pr-4">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.slice().sort((a, b) => (b.payment_date || "").localeCompare(a.payment_date || "")).map((p) => (
                        <tr key={p.id} className="border-b border-border/40">
                          <td className="py-2 pr-4">{fmtDate(p.payment_date)}</td>
                          <td className="py-2 pr-4">{p.payment_method || "—"}</td>
                          <td className="py-2 pr-4 font-mono text-xs">{p.reference || "—"}</td>
                          <td className="py-2 pr-4 text-right td-num tabular-nums text-emerald-400">{fmtMoney(Number(p.amount) || 0)}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{p.notes || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
