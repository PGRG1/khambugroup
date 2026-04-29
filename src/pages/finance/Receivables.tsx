import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, Download, RefreshCw, Search } from "lucide-react";
import { useReceivables, AGE_BUCKETS, bucketOf, AROpenItem } from "@/hooks/useReceivables";
import { AgingMatrix } from "@/components/finance/AgingMatrix";
import { SettleReceivableDialog } from "@/components/finance/SettleReceivableDialog";
import { downloadCSV } from "@/utils/csvDownload";

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Receivables() {
  const { summary, openItems, loading, refresh } = useReceivables();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AROpenItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const filteredOpen = useMemo(() => {
    if (!search) return openItems;
    const s = search.toLowerCase();
    return openItems.filter(
      (o) => o.account_name.toLowerCase().includes(s) || (o.venue || "").toLowerCase().includes(s) || o.memo.toLowerCase().includes(s)
    );
  }, [openItems, search]);

  const totalOutstanding = useMemo(() => summary.reduce((s, r) => s + r.outstanding, 0), [summary]);
  const overdue = useMemo(() => openItems.filter((o) => o.age_days > 30).reduce((s, o) => s + o.open_amount, 0), [openItems]);
  const oldestAge = useMemo(() => openItems.reduce((m, o) => Math.max(m, o.age_days), 0), [openItems]);

  const agingRows = useMemo(() => {
    const map = new Map<string, { label: string; buckets: Record<string, number>; total: number }>();
    for (const acc of summary) {
      map.set(acc.id, { label: `${acc.code} · ${acc.name}`, buckets: Object.fromEntries(AGE_BUCKETS.map(b => [b, 0])), total: 0 });
    }
    for (const o of openItems) {
      const row = map.get(o.account_id);
      if (!row) continue;
      const b = bucketOf(o.age_days);
      row.buckets[b] = (row.buckets[b] || 0) + o.open_amount;
      row.total += o.open_amount;
    }
    return Array.from(map.values()).filter((r) => r.total > 0.005).sort((a, b) => b.total - a.total);
  }, [summary, openItems]);

  const exportOpenCSV = () => {
    downloadCSV(
      filteredOpen.map((o) => ({
        date: o.entry_date,
        account_code: o.account_code,
        account: o.account_name,
        venue: o.venue || "",
        memo: o.memo,
        original: o.original_amount.toFixed(2),
        open: o.open_amount.toFixed(2),
        age_days: o.age_days,
        bucket: bucketOf(o.age_days),
      })),
      [
        { key: "date", label: "Date" },
        { key: "account_code", label: "Account Code" },
        { key: "account", label: "Account" },
        { key: "venue", label: "Venue" },
        { key: "memo", label: "Memo" },
        { key: "original", label: "Original" },
        { key: "open", label: "Open" },
        { key: "age_days", label: "Age (days)" },
        { key: "bucket", label: "Aging Bucket" },
      ],
      "accounts_receivable_open"
    );
  };

  return (
    <div className="p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><Wallet className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Accounts Receivable</h1>
            <p className="text-sm text-muted-foreground mt-1">Track money owed to you — merchant settlements, KPAY, and other AR accounts.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Outstanding Total" value={fmt(totalOutstanding)} />
        <KPI label="Overdue (>30d)" value={fmt(overdue)} accent="text-amber-700" />
        <KPI label="Open Items" value={String(openItems.length)} />
        <KPI label="Oldest Age" value={`${oldestAge}d`} />
      </div>

      <Tabs defaultValue="by-account">
        <TabsList>
          <TabsTrigger value="by-account">By Account</TabsTrigger>
          <TabsTrigger value="open-items">Open Items</TabsTrigger>
          <TabsTrigger value="aging">Aging Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="by-account" className="mt-4">
          <Card className="card-glass overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Code</th>
                  <th className="text-left px-4 py-2 font-medium">Account</th>
                  <th className="text-right px-4 py-2 font-medium">Open Items</th>
                  <th className="text-right px-4 py-2 font-medium">Outstanding</th>
                  <th className="text-left px-4 py-2 font-medium">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                ) : summary.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No AR accounts found.</td></tr>
                ) : summary.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{s.code}</td>
                    <td className="px-4 py-2">{s.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.open_count}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold">{fmt(s.outstanding)}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{s.last_activity || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="open-items" className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9 h-9" placeholder="Search account, venue, memo…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" onClick={exportOpenCSV}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
          </div>
          <Card className="card-glass overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-left px-3 py-2 font-medium">Account</th>
                    <th className="text-left px-3 py-2 font-medium">Venue</th>
                    <th className="text-left px-3 py-2 font-medium">Memo</th>
                    <th className="text-right px-3 py-2 font-medium">Open</th>
                    <th className="text-right px-3 py-2 font-medium">Age</th>
                    <th className="text-left px-3 py-2 font-medium">Bucket</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {filteredOpen.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No open receivables.</td></tr>
                  ) : filteredOpen.slice(0, 500).map((o) => (
                    <tr key={o.line_id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 text-xs font-mono">{o.entry_date}</td>
                      <td className="px-3 py-2 text-xs">{o.account_code} · {o.account_name}</td>
                      <td className="px-3 py-2 text-xs">{o.venue || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[200px]">{o.memo}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(o.open_amount)}</td>
                      <td className="px-3 py-2 text-right text-xs">{o.age_days}d</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${o.age_days > 60 ? 'bg-red-500/10 text-red-700' : o.age_days > 30 ? 'bg-amber-500/10 text-amber-700' : 'bg-emerald-500/10 text-emerald-700'}`}>{bucketOf(o.age_days)}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setSelected(o); setDialogOpen(true); }}>Mark Settled</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredOpen.length > 500 && <div className="px-4 py-2 text-xs text-muted-foreground border-t">Showing first 500 of {filteredOpen.length} items. Use search to narrow.</div>}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="aging" className="mt-4">
          <AgingMatrix title="AR Aging by Account" rows={agingRows} />
        </TabsContent>
      </Tabs>

      <SettleReceivableDialog item={selected} open={dialogOpen} onOpenChange={setDialogOpen} onSettled={refresh} />
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
