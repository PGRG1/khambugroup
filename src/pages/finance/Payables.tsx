import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreditCard, Download, RefreshCw, Search, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { usePayables } from "@/hooks/usePayables";
import { AGE_BUCKETS, bucketOf } from "@/hooks/useReceivables";
import { AgingMatrix } from "@/components/finance/AgingMatrix";
import { downloadCSV } from "@/utils/csvDownload";
import { useInvoiceData } from "@/hooks/useInvoiceData";
import { toast } from "sonner";

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Payables() {
  const { openInvoices, supplierSummary, paidThisMonth, payrollPayables, loading, refresh } = usePayables();
  const { updateInvoiceStatus } = useInvoiceData();
  const [search, setSearch] = useState("");

  const filteredInvoices = useMemo(() => {
    if (!search) return openInvoices;
    const s = search.toLowerCase();
    return openInvoices.filter(
      (i) => i.supplier_name.toLowerCase().includes(s) || i.invoice_number.toLowerCase().includes(s) || i.venue.toLowerCase().includes(s)
    );
  }, [openInvoices, search]);

  const totalOwed = useMemo(() => openInvoices.reduce((s, i) => s + i.total_amount, 0), [openInvoices]);
  const overdue = useMemo(() => openInvoices.filter((i) => i.age_days > 30).reduce((s, i) => s + i.total_amount, 0), [openInvoices]);
  const oldestAge = useMemo(() => openInvoices.reduce((m, i) => Math.max(m, i.age_days), 0), [openInvoices]);

  const agingRows = useMemo(() => {
    const map = new Map<string, { label: string; buckets: Record<string, number>; total: number }>();
    for (const inv of openInvoices) {
      const cur = map.get(inv.supplier_id) || { label: inv.supplier_name, buckets: Object.fromEntries(AGE_BUCKETS.map(b => [b, 0])), total: 0 };
      cur.buckets[inv.bucket] = (cur.buckets[inv.bucket] || 0) + inv.total_amount;
      cur.total += inv.total_amount;
      map.set(inv.supplier_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [openInvoices]);

  const handleMarkPaid = async (id: string) => {
    await updateInvoiceStatus(id, "paid");
    toast.success("Marked paid");
    refresh();
  };

  const exportInvoicesCSV = () => {
    downloadCSV(
      filteredInvoices.map((i) => ({
        date: i.invoice_date,
        due_date: i.due_date || "",
        invoice_number: i.invoice_number,
        supplier: i.supplier_name,
        venue: i.venue,
        amount: i.total_amount.toFixed(2),
        age_days: i.age_days,
        bucket: i.bucket,
      })),
      [
        { key: "date", label: "Invoice Date" },
        { key: "due_date", label: "Due Date" },
        { key: "invoice_number", label: "Invoice #" },
        { key: "supplier", label: "Supplier & Vendor" },
        { key: "venue", label: "Venue" },
        { key: "amount", label: "Amount" },
        { key: "age_days", label: "Age (days)" },
        { key: "bucket", label: "Aging Bucket" },
      ],
      "accounts_payable_open"
    );
  };

  return (
    <div className="p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><CreditCard className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Accounts Payable</h1>
            <p className="text-sm text-muted-foreground mt-1">Track money you owe to suppliers & vendors — based on unpaid procurement invoices.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Total Owed" value={fmt(totalOwed)} />
        <KPI label="Overdue (>30d)" value={fmt(overdue)} accent="text-amber-700" />
        <KPI label="Paid This Month" value={fmt(paidThisMonth)} accent="text-emerald-700" />
        <KPI label="Oldest Unpaid" value={`${oldestAge}d`} />
      </div>

      {payrollPayables && payrollPayables.length > 0 && (
        <Card className="card-glass p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold">Payroll Liabilities</h3>
              <p className="text-xs text-muted-foreground">Outstanding amounts owed to staff and the MPF trustee (from the General Ledger).</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {payrollPayables.map((p) => (
              <div key={p.account_code} className="flex items-center justify-between border border-border/40 rounded-lg px-3 py-2 bg-muted/20">
                <div>
                  <div className="text-sm font-medium">{p.account_name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{p.account_code}</div>
                </div>
                <div className="font-mono tabular-nums text-base font-semibold">{fmt(p.outstanding)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Tabs defaultValue="by-supplier">
        <TabsList>
          <TabsTrigger value="by-supplier">By Supplier & Vendor</TabsTrigger>
          <TabsTrigger value="open-invoices">Open Invoices</TabsTrigger>
          <TabsTrigger value="aging">Aging Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="by-supplier" className="mt-4">
          <Card className="card-glass overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Supplier & Vendor</th>
                  <th className="text-right px-4 py-2 font-medium">Open Invoices</th>
                  <th className="text-right px-4 py-2 font-medium">Outstanding</th>
                  <th className="text-right px-4 py-2 font-medium">Oldest</th>
                  <th className="text-left px-4 py-2 font-medium">Last Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                ) : supplierSummary.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">All clear — no outstanding payables.</td></tr>
                ) : supplierSummary.map((s) => (
                  <tr key={s.supplier_id} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{s.supplier_name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.open_count}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold">{fmt(s.outstanding)}</td>
                    <td className="px-4 py-2 text-right text-xs">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${s.oldest_age > 60 ? 'bg-red-500/10 text-red-700' : s.oldest_age > 30 ? 'bg-amber-500/10 text-amber-700' : 'bg-emerald-500/10 text-emerald-700'}`}>{s.oldest_age}d</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{s.last_invoice_date || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="open-invoices" className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9 h-9" placeholder="Search supplier & vendor, invoice #, venue…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" onClick={exportInvoicesCSV}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
          </div>
          <Card className="card-glass overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-left px-3 py-2 font-medium">Invoice #</th>
                    <th className="text-left px-3 py-2 font-medium">Supplier & Vendor</th>
                    <th className="text-left px-3 py-2 font-medium">Venue</th>
                    <th className="text-right px-3 py-2 font-medium">Amount</th>
                    <th className="text-right px-3 py-2 font-medium">Age</th>
                    <th className="text-left px-3 py-2 font-medium">Bucket</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {filteredInvoices.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No open invoices.</td></tr>
                  ) : filteredInvoices.slice(0, 500).map((i) => (
                    <tr key={i.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 text-xs font-mono">{i.invoice_date}</td>
                      <td className="px-3 py-2 text-xs">{i.invoice_number || "—"}</td>
                      <td className="px-3 py-2 text-xs">{i.supplier_name}</td>
                      <td className="px-3 py-2 text-xs">{i.venue}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(i.total_amount)}</td>
                      <td className="px-3 py-2 text-right text-xs">{i.age_days}d</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${i.age_days > 60 ? 'bg-red-500/10 text-red-700' : i.age_days > 30 ? 'bg-amber-500/10 text-amber-700' : 'bg-emerald-500/10 text-emerald-700'}`}>{i.bucket}</span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleMarkPaid(i.id)}>Mark Paid</Button>
                        <Link to="/procurement/invoices" className="inline-block ml-1 p-1 text-muted-foreground hover:text-foreground" title="Open in Invoices"><ExternalLink className="h-3.5 w-3.5" /></Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredInvoices.length > 500 && <div className="px-4 py-2 text-xs text-muted-foreground border-t">Showing first 500 of {filteredInvoices.length}. Use search to narrow.</div>}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="aging" className="mt-4">
          <AgingMatrix title="AP Aging by Supplier & Vendor" rows={agingRows} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPI({ label, value, accent = "" }: { label: string; value: string; accent?: string }) {
  return (
    <Card className="card-glass p-4 min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold font-mono tabular-nums mt-1 truncate ${accent}`}>{value}</div>
    </Card>
  );
}
