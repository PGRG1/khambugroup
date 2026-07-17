import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const AGEING_BUCKETS = [
  { v: "all", l: "All" },
  { v: "current", l: "Current" },
  { v: "1-30", l: "1–30 days" },
  { v: "31-60", l: "31–60 days" },
  { v: "61-90", l: "61–90 days" },
  { v: "90+", l: "90+ days" },
];

type Bill = { id: string; supplier_id: string | null; vendor_name: string | null; bill_number: string | null; bill_date: string | null; due_date: string | null; venue: string | null; total_amount: number | null; paid_amount: number | null; approval_status: string | null; payment_status: string | null };

export default function ExpenseOpenPayablesPage() {
  const navigate = useNavigate();
  const { tenantId } = useActiveTenant();
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState<Bill[]>([]);
  const [paidByBill, setPaidByBill] = useState<Map<string, number>>(new Map());
  const [vendorMap, setVendorMap] = useState<Map<string, string>>(new Map());
  const [bucket, setBucket] = useState("all");
  const [venueFilter, setVenueFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: sups }, billRows, payRows] = await Promise.all([
        (supabase as any).from("suppliers").select("id, name").eq("tenant_id", tenantId).eq("vendor_type", "expense"),
        fetchAllRows("expense_bills", "id, supplier_id, vendor_name, bill_number, bill_date, due_date, venue, total_amount, paid_amount, approval_status, payment_status", undefined, tenantId),
        fetchAllRows("expense_bill_payments", "bill_id, amount", undefined, tenantId),
      ]);
      if (cancelled) return;
      const vm = new Map<string, string>();
      for (const s of (sups || []) as any[]) vm.set(s.id, s.name || "—");
      setVendorMap(vm);
      const pbb = new Map<string, number>();
      for (const p of payRows as any[]) pbb.set(p.bill_id, (pbb.get(p.bill_id) || 0) + (Number(p.amount) || 0));
      setPaidByBill(pbb);
      setBills(billRows as Bill[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const inSevenDays = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const openBills = useMemo(() => {
    return bills
      .filter((b) => {
        if (!b.supplier_id || !vendorMap.has(b.supplier_id)) return false;
        if (["draft", "voided", "reversed"].includes(b.approval_status || "")) return false;
        const total = Number(b.total_amount) || 0;
        const paid = paidByBill.get(b.id) ?? (Number(b.paid_amount) || 0);
        const out = total - paid;
        if (out <= 0.005) return false;
        if (venueFilter !== "all" && b.venue !== venueFilter) return false;
        if (vendorFilter !== "all" && b.supplier_id !== vendorFilter) return false;
        return true;
      })
      .map((b) => {
        const total = Number(b.total_amount) || 0;
        const paid = paidByBill.get(b.id) ?? (Number(b.paid_amount) || 0);
        return { bill: b, total, paid, outstanding: Math.max(0, total - paid) };
      });
  }, [bills, paidByBill, vendorMap, venueFilter, vendorFilter]);

  const venues = useMemo(() => {
    const s = new Set<string>();
    for (const b of bills) if (b.venue) s.add(b.venue);
    return Array.from(s).sort();
  }, [bills]);

  const vendorOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of bills) if (b.supplier_id && vendorMap.has(b.supplier_id)) m.set(b.supplier_id, vendorMap.get(b.supplier_id)!);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [bills, vendorMap]);

  const withAging = useMemo(() => openBills.map(({ bill, outstanding, total, paid }) => {
    const due = bill.due_date || bill.bill_date;
    const daysOverdue = due ? Math.floor((today.getTime() - new Date(due).getTime()) / 86400000) : 0;
    return { bill, outstanding, total, paid, daysOverdue: Math.max(0, daysOverdue) };
  }), [openBills, todayStr]);

  const bucketed = useMemo(() => withAging.filter(({ daysOverdue, bill }) => {
    if (bucket === "all") return true;
    if (bucket === "current") return !bill.due_date || bill.due_date >= todayStr;
    if (bucket === "1-30") return daysOverdue >= 1 && daysOverdue <= 30;
    if (bucket === "31-60") return daysOverdue >= 31 && daysOverdue <= 60;
    if (bucket === "61-90") return daysOverdue >= 61 && daysOverdue <= 90;
    if (bucket === "90+") return daysOverdue > 90;
    return true;
  }), [withAging, bucket, todayStr]);

  const totals = useMemo(() => {
    let outstanding = 0, overdue = 0, dueWeek = 0;
    for (const { bill, outstanding: o } of openBills) {
      outstanding += o;
      if (bill.due_date && bill.due_date < todayStr) overdue += o;
      if (bill.due_date && bill.due_date >= todayStr && bill.due_date <= inSevenDays) dueWeek += o;
    }
    return { outstanding, overdue, dueWeek };
  }, [openBills, todayStr, inSevenDays]);

  // Group by vendor for display
  const byVendor = useMemo(() => {
    const m = new Map<string, typeof bucketed>();
    for (const row of bucketed) {
      const key = row.bill.supplier_id || "unknown";
      if (!m.has(key)) m.set(key, [] as any);
      m.get(key)!.push(row);
    }
    return Array.from(m.entries()).map(([sid, rows]) => ({
      supplier_id: sid,
      name: vendorMap.get(sid) || rows[0]?.bill.vendor_name || "Unknown vendor",
      rows,
      total: rows.reduce((s, r) => s + r.outstanding, 0),
    })).sort((a, b) => b.total - a.total);
  }, [bucketed, vendorMap]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Open Payables</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Outstanding expense bills grouped by vendor, aged by due date</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={venueFilter} onValueChange={setVenueFilter}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="All venues" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All venues</SelectItem>
              {venues.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="All vendors" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {vendorOptions.map(([id, name]) => (<SelectItem key={id} value={id}>{name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KCard label="Total outstanding" value={fmtMoney(totals.outstanding)} tone="amber" />
        <KCard label="Total overdue" value={fmtMoney(totals.overdue)} tone="red" />
        <KCard label="Due this week" value={fmtMoney(totals.dueWeek)} tone="sky" />
      </div>

      <div className="flex flex-wrap gap-2">
        {AGEING_BUCKETS.map((b) => (
          <button
            key={b.v}
            onClick={() => setBucket(b.v)}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${bucket === b.v ? "bg-amber-400/15 border-amber-400 text-amber-400" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {b.l}
          </button>
        ))}
      </div>

      <Card className="card-glass">
        <CardContent className="p-5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Open bills ({bucketed.length})</div>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : bucketed.length === 0 ? (
            <div className="text-sm text-muted-foreground">No bills in this bucket.</div>
          ) : (
            <div className="space-y-6">
              {byVendor.map((group) => (
                <div key={group.supplier_id}>
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => navigate(`/expenses/finance/vendors/${group.supplier_id}`)}
                      className="text-sm font-semibold hover:text-amber-400 hover:underline"
                    >
                      {group.name}
                    </button>
                    <div className="text-sm td-num text-amber-400">{fmtMoney(group.total)}</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                          <th className="text-left py-2 pr-4">Bill #</th>
                          <th className="text-left py-2 pr-4">Venue</th>
                          <th className="text-left py-2 pr-4">Bill date</th>
                          <th className="text-left py-2 pr-4">Due date</th>
                          <th className="text-right py-2 pr-4">Total</th>
                          <th className="text-right py-2 pr-4">Paid</th>
                          <th className="text-right py-2 pr-4">Outstanding</th>
                          <th className="text-right py-2 pr-4">Days overdue</th>
                          <th className="text-left py-2 pr-4">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map(({ bill, total, paid, outstanding, daysOverdue }) => (
                          <tr key={bill.id} className="border-b border-border/40">
                            <td className="py-2 pr-4 font-mono text-xs">{bill.bill_number || "—"}</td>
                            <td className="py-2 pr-4">{bill.venue || "—"}</td>
                            <td className="py-2 pr-4">{fmtDate(bill.bill_date)}</td>
                            <td className="py-2 pr-4">{fmtDate(bill.due_date)}</td>
                            <td className="py-2 pr-4 text-right td-num tabular-nums">{fmtMoney(total)}</td>
                            <td className="py-2 pr-4 text-right td-num tabular-nums text-muted-foreground">{fmtMoney(paid)}</td>
                            <td className="py-2 pr-4 text-right td-num tabular-nums text-amber-400">{fmtMoney(outstanding)}</td>
                            <td className={`py-2 pr-4 text-right td-num tabular-nums ${daysOverdue > 60 ? "text-red-400" : daysOverdue > 0 ? "text-amber-400" : "text-muted-foreground/60"}`}>{daysOverdue > 0 ? `${daysOverdue}d` : "—"}</td>
                            <td className="py-2 pr-4"><Badge variant="outline" className="text-[10px]">{bill.payment_status}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
