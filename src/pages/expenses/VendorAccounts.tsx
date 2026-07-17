import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtMoney = (n: number) => `HK$ ${(Number(n) || 0).toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${String(dt.getDate()).padStart(2, "0")} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
};

function KCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "amber" | "green" | "red" | "sky" }) {
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
        <div className={`mt-1 text-2xl font-semibold td-num ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

type Bill = { id: string; supplier_id: string | null; vendor_name: string | null; bill_date: string | null; due_date: string | null; total_amount: number | null; paid_amount: number | null; approval_status: string | null; payment_status: string | null };
type Payment = { id: string; bill_id: string; payment_date: string | null; amount: number | null };

const POSTED = new Set(["approved", "posted"]);

export default function ExpenseVendorAccountsPage() {
  const navigate = useNavigate();
  const { tenantId } = useActiveTenant();
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: sups }, billRows, payRows] = await Promise.all([
        (supabase as any).from("suppliers").select("id, name").eq("tenant_id", tenantId).eq("vendor_type", "expense"),
        fetchAllRows("expense_bills", "id, supplier_id, vendor_name, bill_date, due_date, total_amount, paid_amount, approval_status, payment_status", undefined, tenantId),
        fetchAllRows("expense_bill_payments", "id, bill_id, payment_date, amount", undefined, tenantId),
      ]);
      if (cancelled) return;
      setVendors((sups || []).map((s: any) => ({ id: s.id, name: s.name || "—" })));
      setBills(billRows as Bill[]);
      setPayments(payRows as Payment[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const rows = useMemo(() => {
    const vendorMap = new Map(vendors.map((v) => [v.id, v.name]));
    const paidByBill = new Map<string, number>();
    for (const p of payments) paidByBill.set(p.bill_id, (paidByBill.get(p.bill_id) || 0) + (Number(p.amount) || 0));
    const lastPaymentByBill = new Map<string, string>();
    for (const p of payments) {
      if (!p.payment_date) continue;
      const prev = lastPaymentByBill.get(p.bill_id);
      if (!prev || p.payment_date > prev) lastPaymentByBill.set(p.bill_id, p.payment_date);
    }

    type Agg = { supplier_id: string; supplier_name: string; total_billed: number; total_paid: number; outstanding: number; overdue: number; open_bills: number; last_bill_date: string | null; last_activity: string | null };
    const m = new Map<string, Agg>();
    const get = (sid: string, name: string): Agg => {
      let a = m.get(sid);
      if (!a) { a = { supplier_id: sid, supplier_name: name, total_billed: 0, total_paid: 0, outstanding: 0, overdue: 0, open_bills: 0, last_bill_date: null, last_activity: null }; m.set(sid, a); }
      return a;
    };

    for (const b of bills) {
      if (b.approval_status === "voided" || b.approval_status === "reversed" || b.approval_status === "draft") continue;
      const sid = b.supplier_id;
      if (!sid) continue;
      const name = vendorMap.get(sid);
      if (!name) continue; // only expense vendors
      const a = get(sid, name);
      const total = Number(b.total_amount) || 0;
      const paid = paidByBill.get(b.id) ?? (Number(b.paid_amount) || 0);
      const outstanding = Math.max(0, total - paid);
      a.total_billed += total;
      a.total_paid += paid;
      if (outstanding > 0.005) {
        a.outstanding += outstanding;
        a.open_bills += 1;
        if (b.due_date && b.due_date < todayStr) a.overdue += outstanding;
      }
      if (!a.last_bill_date || (b.bill_date || "") > a.last_bill_date) a.last_bill_date = b.bill_date;
      const lastPay = lastPaymentByBill.get(b.id);
      const activity = [b.bill_date, lastPay].filter(Boolean).sort().pop() || null;
      if (activity && (!a.last_activity || activity > a.last_activity)) a.last_activity = activity;
    }

    // include vendors with no bills yet
    for (const v of vendors) if (!m.has(v.id)) get(v.id, v.name);

    let list = Array.from(m.values()).sort((a, b) => b.outstanding - a.outstanding || b.total_billed - a.total_billed);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.supplier_name.toLowerCase().includes(q));
    }
    return list;
  }, [vendors, bills, payments, todayStr, search]);

  const totals = useMemo(() => {
    let billed = 0, paid = 0, outstanding = 0, overdue = 0;
    for (const r of rows) { billed += r.total_billed; paid += r.total_paid; outstanding += r.outstanding; overdue += r.overdue; }
    return { billed, paid, outstanding, overdue };
  }, [rows]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Vendor Accounts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Total billed, paid, and outstanding for each expense vendor</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendors" className="h-9 pl-8 w-[220px]" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KCard label="Total billed" value={fmtMoney(totals.billed)} />
        <KCard label="Total paid" value={fmtMoney(totals.paid)} tone="green" />
        <KCard label="Outstanding" value={fmtMoney(totals.outstanding)} tone="amber" />
        <KCard label="Overdue" value={fmtMoney(totals.overdue)} tone="red" />
      </div>

      <Card className="card-glass">
        <CardContent className="p-5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Vendors ({rows.length})</div>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No expense vendors yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-4">Vendor</th>
                    <th className="text-right py-2 pr-4">Total billed</th>
                    <th className="text-right py-2 pr-4">Total paid</th>
                    <th className="text-right py-2 pr-4">Outstanding</th>
                    <th className="text-right py-2 pr-4">Overdue</th>
                    <th className="text-right py-2 pr-4">Open bills</th>
                    <th className="text-left py-2 pr-4">Last bill</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.supplier_id}
                      onClick={() => navigate(`/expenses/finance/vendors/${r.supplier_id}`)}
                      className={`border-b border-border/40 cursor-pointer hover:bg-muted/30 transition-colors ${r.overdue > 0 ? "border-l-2 border-l-amber-400" : ""}`}
                    >
                      <td className="py-2 pr-4 font-semibold">{r.supplier_name}</td>
                      <td className="py-2 pr-4 text-right td-num tabular-nums">{fmtMoney(r.total_billed)}</td>
                      <td className="py-2 pr-4 text-right td-num tabular-nums text-muted-foreground">{fmtMoney(r.total_paid)}</td>
                      <td className={`py-2 pr-4 text-right td-num tabular-nums ${r.outstanding > 0 ? "text-amber-400" : "text-muted-foreground/60"}`}>{r.outstanding > 0 ? fmtMoney(r.outstanding) : "—"}</td>
                      <td className={`py-2 pr-4 text-right td-num tabular-nums ${r.overdue > 0 ? "text-red-400" : "text-muted-foreground/60"}`}>{r.overdue > 0 ? fmtMoney(r.overdue) : "—"}</td>
                      <td className="py-2 pr-4 text-right td-num">{r.open_bills}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{fmtDate(r.last_bill_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
