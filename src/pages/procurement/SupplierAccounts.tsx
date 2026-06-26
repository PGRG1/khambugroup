import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { usePayables } from "@/hooks/usePayables";

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

export default function SupplierAccountsPage() {
  const navigate = useNavigate();
  const { tenantId } = useActiveTenant();
  const { invoices, creditNotesAvailable, loading } = usePayables();
  const [payments, setPayments] = useState<any[]>([]);
  const [allocs, setAllocs] = useState<any[]>([]);
  const [paymentsFailed, setPaymentsFailed] = useState(false);
  const [supplierMap, setSupplierMap] = useState<Map<string, string>>(new Map());
  const [venues, setVenues] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [venueFilter, setVenueFilter] = useState("all");

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const [pays, alcs, sups, grnRows] = await Promise.all([
          fetchAllRows("payments", "id, payment_date, amount, supplier_id"),
          fetchAllRows("payment_allocations", "id, payment_id, amount_allocated"),
          fetchAllRows("suppliers", "id, name", undefined, tenantId),
          fetchAllRows("goods_received_notes", "venue", undefined, tenantId),
        ]);
        setPayments(pays); setAllocs(alcs);
        const m = new Map<string, string>();
        for (const s of sups as any[]) m.set(s.id, s.name || "—");
        setSupplierMap(m);
        const set = new Set<string>();
        for (const r of grnRows as any[]) if (r.venue) set.add(String(r.venue));
        setVenues(Array.from(set).sort());
      } catch {
        setPaymentsFailed(true);
      }
    })();
  }, [tenantId]);

  const todayStr = new Date().toISOString().slice(0, 10);

  // Pre-filter invoices by venue (client-side)
  const filteredInvoices = useMemo(() => {
    if (venueFilter === "all") return invoices;
    return invoices.filter((i) => i.venue === venueFilter);
  }, [invoices, venueFilter]);

  const rows = useMemo(() => {
    const tenantSupplierIds = new Set(filteredInvoices.map((i) => i.supplier_id).filter(Boolean) as string[]);
    for (const cn of creditNotesAvailable) tenantSupplierIds.add(cn.supplier_id);

    const allocSumByPayment = new Map<string, number>();
    for (const a of allocs) allocSumByPayment.set(a.payment_id, (allocSumByPayment.get(a.payment_id) || 0) + (Number(a.amount_allocated) || 0));

    type Agg = {
      supplier_id: string; supplier_name: string;
      current_balance: number; overdue_balance: number;
      available_credits: number; unallocated_payments: number;
      open_invoice_count: number; last_transaction_date: string | null;
    };
    const m = new Map<string, Agg>();
    const get = (sid: string): Agg => {
      let a = m.get(sid);
      if (!a) {
        a = { supplier_id: sid, supplier_name: supplierMap.get(sid) || "—",
          current_balance: 0, overdue_balance: 0, available_credits: 0,
          unallocated_payments: 0, open_invoice_count: 0, last_transaction_date: null };
        m.set(sid, a);
      }
      return a;
    };

    for (const inv of filteredInvoices) {
      if (!inv.supplier_id) continue;
      const a = get(inv.supplier_id);
      if (!a.supplier_name || a.supplier_name === "—") a.supplier_name = inv.supplier_name;
      if (inv.outstanding_amount > 0 && inv.payment_status !== "voided") {
        a.current_balance += inv.outstanding_amount;
        a.open_invoice_count += 1;
        if (inv.due_date && inv.due_date < todayStr) a.overdue_balance += inv.outstanding_amount;
      }
      if (!a.last_transaction_date || (inv.invoice_date || "") > a.last_transaction_date) a.last_transaction_date = inv.invoice_date;
    }
    for (const cn of creditNotesAvailable) {
      const a = get(cn.supplier_id);
      a.available_credits += cn.remaining_balance;
      if (!a.last_transaction_date || (cn.credit_note_date || "") > a.last_transaction_date) a.last_transaction_date = cn.credit_note_date;
    }
    if (!paymentsFailed) for (const p of payments) {
      if (!p.supplier_id || !tenantSupplierIds.has(p.supplier_id)) continue;
      const a = get(p.supplier_id);
      const amt = Number(p.amount) || 0;
      const allocated = allocSumByPayment.get(p.id) || 0;
      const unalloc = Math.max(0, amt - allocated);
      if (unalloc > 0.01) a.unallocated_payments += unalloc;
      if (!a.last_transaction_date || (p.payment_date || "") > a.last_transaction_date) a.last_transaction_date = p.payment_date;
    }
    let list = Array.from(m.values()).sort((a, b) => b.current_balance - a.current_balance);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.supplier_name.toLowerCase().includes(q));
    }
    return list;
  }, [filteredInvoices, creditNotesAvailable, payments, allocs, supplierMap, todayStr, search, paymentsFailed]);

  const totals = useMemo(() => {
    let outstanding = 0, overdue = 0, credits = 0, unalloc = 0;
    for (const r of rows) {
      outstanding += r.current_balance;
      overdue += r.overdue_balance;
      credits += r.available_credits;
      unalloc += r.unallocated_payments;
    }
    return { outstanding, overdue, credits, unalloc };
  }, [rows]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Supplier Accounts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Current balance, credits, and payment position for each supplier</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search suppliers" className="h-9 pl-8 w-[220px]" />
          </div>
          <Select value={venueFilter} onValueChange={setVenueFilter}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="All venues" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All venues</SelectItem>
              {venues.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KCard label="Total outstanding" value={fmtMoney(totals.outstanding)} tone="amber" />
        <KCard label="Total overdue" value={fmtMoney(totals.overdue)} tone="red" />
        <KCard label="Available credits" value={fmtMoney(totals.credits)} tone="green" />
        <KCard label="Unallocated payments" value={paymentsFailed ? "—" : fmtMoney(totals.unalloc)} tone="amber" />
      </div>

      <Card className="card-glass">
        <CardContent className="p-5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Suppliers ({rows.length})</div>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No supplier activity yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-4">Supplier</th>
                    <th className="text-right py-2 pr-4">Balance</th>
                    <th className="text-right py-2 pr-4">Overdue</th>
                    <th className="text-right py-2 pr-4">Available credits</th>
                    <th className="text-right py-2 pr-4">Unallocated payments</th>
                    <th className="text-right py-2 pr-4">Open invoices</th>
                    <th className="text-left py-2 pr-4">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.supplier_id}
                      onClick={() => navigate(`/procurement/finance/suppliers/${r.supplier_id}`)}
                      className={`border-b border-border/40 cursor-pointer hover:bg-muted/30 transition-colors ${r.overdue_balance > 0 ? "border-l-2 border-l-amber-400" : ""}`}
                    >
                      <td className="py-2 pr-4 font-semibold">{r.supplier_name}</td>
                      <td className={`py-2 pr-4 text-right td-num tabular-nums ${r.current_balance > 0 ? "text-amber-400" : ""}`}>{fmtMoney(r.current_balance)}</td>
                      <td className={`py-2 pr-4 text-right td-num tabular-nums ${r.overdue_balance > 0 ? "text-red-400" : "text-muted-foreground/60"}`}>{r.overdue_balance > 0 ? fmtMoney(r.overdue_balance) : "—"}</td>
                      <td className={`py-2 pr-4 text-right td-num tabular-nums ${r.available_credits > 0 ? "text-emerald-400" : "text-muted-foreground/60"}`}>{r.available_credits > 0 ? fmtMoney(r.available_credits) : "—"}</td>
                      <td className="py-2 pr-4 text-right td-num tabular-nums">
                        {paymentsFailed ? <span className="text-muted-foreground/60">—</span> :
                          r.unallocated_payments > 0 ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30">Unallocated</Badge>
                              {fmtMoney(r.unallocated_payments)}
                            </span>
                          ) : <span className="text-muted-foreground/60">—</span>}
                      </td>
                      <td className="py-2 pr-4 text-right td-num">{r.open_invoice_count}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{fmtDate(r.last_transaction_date)}</td>
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
