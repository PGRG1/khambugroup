import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const AGEING_BUCKETS = [
  { v: "all", l: "All" },
  { v: "current", l: "Current" },
  { v: "1-30", l: "1–30 days" },
  { v: "31-60", l: "31–60 days" },
  { v: "61-90", l: "61–90 days" },
  { v: "90+", l: "90+ days" },
];

export default function OpenPayablesPage() {
  const navigate = useNavigate();
  const { tenantId } = useActiveTenant();
  const { invoices, creditNotesAvailable, loading } = usePayables();
  const [bucket, setBucket] = useState("all");
  const [venueFilter, setVenueFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [venues, setVenues] = useState<string[]>([]);


  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const grnRows = await fetchAllRows("goods_received_notes", "venue", undefined, tenantId);
      const set = new Set<string>();
      for (const r of grnRows as any[]) if (r.venue) set.add(String(r.venue));
      setVenues(Array.from(set).sort());
    })();
  }, [tenantId]);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const inSevenDays = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const openInvoices = useMemo(() => {
    return invoices.filter((i) => {
      if (i.outstanding_amount <= 0 || i.payment_status === "voided") return false;
      if (venueFilter !== "all" && i.venue !== venueFilter) return false;
      if (supplierFilter !== "all" && i.supplier_id !== supplierFilter) return false;
      return true;
    });
  }, [invoices, venueFilter, supplierFilter]);

  const supplierOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of invoices) if (i.supplier_id) m.set(i.supplier_id, i.supplier_name);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [invoices]);

  const withAging = useMemo(() => openInvoices.map((i) => {
    const due = i.due_date || i.invoice_date;
    const daysOverdue = due ? Math.floor((today.getTime() - new Date(due).getTime()) / 86400000) : 0;
    return { inv: i, daysOverdue: Math.max(0, daysOverdue) };
  }), [openInvoices, todayStr]);

  const bucketed = useMemo(() => withAging.filter(({ daysOverdue, inv }) => {
    if (bucket === "all") return true;
    if (bucket === "current") return !inv.due_date || inv.due_date >= todayStr;
    if (bucket === "1-30") return daysOverdue >= 1 && daysOverdue <= 30;
    if (bucket === "31-60") return daysOverdue >= 31 && daysOverdue <= 60;
    if (bucket === "61-90") return daysOverdue >= 61 && daysOverdue <= 90;
    if (bucket === "90+") return daysOverdue > 90;
    return true;
  }), [withAging, bucket, todayStr]);

  const totals = useMemo(() => {
    let outstanding = 0, overdue = 0, dueWeek = 0;
    for (const i of openInvoices) {
      outstanding += i.outstanding_amount;
      if (i.due_date && i.due_date < todayStr) overdue += i.outstanding_amount;
      if (i.due_date && i.due_date >= todayStr && i.due_date <= inSevenDays) dueWeek += i.outstanding_amount;
    }
    const credits = creditNotesAvailable.reduce((s, c) => s + c.remaining_balance, 0);
    return { outstanding, overdue, dueWeek, credits };
  }, [openInvoices, creditNotesAvailable, todayStr, inSevenDays]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-display">Open Payables</h1>
          <p className="text-sm text-muted-foreground mt-0.5">All outstanding supplier invoices awaiting payment</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={venueFilter} onValueChange={setVenueFilter}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="All venues" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All venues</SelectItem>
              {venues.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="All suppliers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suppliers</SelectItem>
              {supplierOptions.map(([id, name]) => (<SelectItem key={id} value={id}>{name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KCard label="Total outstanding" value={fmtMoney(totals.outstanding)} tone="amber" />
        <KCard label="Total overdue" value={fmtMoney(totals.overdue)} tone="red" />
        <KCard label="Due this week" value={fmtMoney(totals.dueWeek)} tone="sky" />
        <KCard label="Available credits to apply" value={fmtMoney(totals.credits)} tone="green" />
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

      <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        To record a payment, open the supplier account and use Record Payment.
      </div>

      <Card className="card-glass">
        <CardContent className="p-5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Open invoices ({bucketed.length})</div>

          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : bucketed.length === 0 ? (
            <div className="text-sm text-muted-foreground">No invoices in this bucket.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="text-left py-2 pr-4">Supplier</th>
                    <th className="text-left py-2 pr-4">Invoice #</th>
                    <th className="text-left py-2 pr-4">Venue</th>
                    <th className="text-left py-2 pr-4">Invoice date</th>
                    <th className="text-left py-2 pr-4">Due date</th>
                    <th className="text-right py-2 pr-4">Total</th>
                    <th className="text-right py-2 pr-4">Paid</th>
                    <th className="text-right py-2 pr-4">Outstanding</th>
                    <th className="text-right py-2 pr-4">Days overdue</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-right py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bucketed.map(({ inv, daysOverdue }) => (
                    <tr key={inv.id} className="border-b border-border/40">
                      <td className="py-2 pr-4">
                        <button
                          onClick={() => navigate(`/procurement/finance/suppliers/${inv.supplier_id}`)}
                          className="font-semibold hover:text-amber-400 hover:underline text-left"
                        >
                          {inv.supplier_name}
                        </button>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{inv.invoice_number}</td>
                      <td className="py-2 pr-4">{inv.venue || "—"}</td>
                      <td className="py-2 pr-4">{fmtDate(inv.invoice_date)}</td>
                      <td className="py-2 pr-4">{fmtDate(inv.due_date)}</td>
                      <td className="py-2 pr-4 text-right td-num tabular-nums">{fmtMoney(inv.total_amount)}</td>
                      <td className="py-2 pr-4 text-right td-num tabular-nums text-muted-foreground">{fmtMoney(inv.amount_paid)}</td>
                      <td className="py-2 pr-4 text-right td-num tabular-nums text-amber-400">{fmtMoney(inv.outstanding_amount)}</td>
                      <td className={`py-2 pr-4 text-right td-num tabular-nums ${daysOverdue > 60 ? "text-red-400" : daysOverdue > 0 ? "text-amber-400" : "text-muted-foreground/60"}`}>{daysOverdue > 0 ? `${daysOverdue}d` : "—"}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-[10px]">{inv.payment_status}</Badge>
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/procurement/finance/suppliers/${inv.supplier_id}`, { state: { openTab: "open", highlightInvoiceId: inv.id } })}
                        >
                          View
                        </Button>
                      </td>
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

