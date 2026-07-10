import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, Download, RefreshCw, Search, AlertTriangle, CalendarClock, CheckCircle2, ListChecks } from "lucide-react";
import { useReceivables, AGE_BUCKETS, bucketOf, AROpenItem } from "@/hooks/useReceivables";
import { AgingMatrix } from "@/components/finance/AgingMatrix";
import { SettleReceivableDialog } from "@/components/finance/SettleReceivableDialog";
import { downloadCSV } from "@/utils/csvDownload";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtWhole = (n: number) => n.toLocaleString("en-HK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
};

// Aging bucket tone map — parallels Payables' aging chips.
const BUCKET_TONE: Record<string, string> = {
  "Current": "bg-primary/10 text-primary border-primary/20",
  "1-30": "bg-info/10 text-info border-info/20",
  "31-60": "bg-warning/10 text-warning border-warning/20",
  "61-90": "bg-warning/10 text-warning border-warning/20",
  "90+": "bg-destructive/10 text-destructive border-destructive/20",
};
const bucketTone = (b: string) => BUCKET_TONE[b] || "bg-muted text-muted-foreground border-border";

export default function Receivables() {
  const { summary, openItems, loading, refresh } = useReceivables();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AROpenItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tab, setTab] = useState("by-account");

  const filteredOpen = useMemo(() => {
    if (!search) return openItems;
    const s = search.toLowerCase();
    return openItems.filter(
      (o) => o.account_name.toLowerCase().includes(s) || (o.venue || "").toLowerCase().includes(s) || o.memo.toLowerCase().includes(s)
    );
  }, [openItems, search]);

  const totalOutstanding = useMemo(() => summary.reduce((s, r) => s + r.outstanding, 0), [summary]);
  const overdue = useMemo(() => openItems.filter((o) => o.age_days > 30).reduce((s, o) => s + o.open_amount, 0), [openItems]);
  const overdueCount = useMemo(() => openItems.filter((o) => o.age_days > 30).length, [openItems]);
  const dueSoon = useMemo(() => openItems.filter((o) => o.age_days > 0 && o.age_days <= 30).reduce((s, o) => s + o.open_amount, 0), [openItems]);
  const dueSoonCount = useMemo(() => openItems.filter((o) => o.age_days > 0 && o.age_days <= 30).length, [openItems]);
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
    <div className="p-4 sm:p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">Accounts Receivable</h1>
            <p className="text-sm text-muted-foreground mt-1">Track money owed to you — merchant settlements, KPAY, and other AR accounts.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="h-9">
          <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} /> Refresh
        </Button>
      </header>

      <p className="text-xs text-muted-foreground -mt-2">
        {summary.length} AR account{summary.length === 1 ? "" : "s"} · {openItems.length} open item{openItems.length === 1 ? "" : "s"}
      </p>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI
          icon={<Wallet className="h-4 w-4" />}
          label="Total Outstanding"
          value={`HK$ ${fmtWhole(totalOutstanding)}`}
          sub={`Across ${openItems.length} items`}
          loading={loading}
        />
        <KPI
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Overdue (>30d)"
          value={`HK$ ${fmtWhole(overdue)}`}
          sub={`${overdueCount} items · oldest ${oldestAge}d`}
          tone="destructive"
          onClick={() => setTab("open-items")}
          loading={loading}
        />
        <KPI
          icon={<CalendarClock className="h-4 w-4" />}
          label="Due Soon (1–30d)"
          value={`HK$ ${fmtWhole(dueSoon)}`}
          sub={`${dueSoonCount} items`}
          tone="warning"
          loading={loading}
        />
        <KPI
          icon={<ListChecks className="h-4 w-4" />}
          label="Open Items"
          value={openItems.length.toLocaleString()}
          sub={`${summary.length} AR accounts`}
          loading={loading}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="by-account">By Account</TabsTrigger>
          <TabsTrigger value="open-items">Open Items</TabsTrigger>
          <TabsTrigger value="aging">Aging Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="by-account" className="mt-4">
          {/* Desktop */}
          <Card className="card-glass p-0 overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">Code</th>
                    <th className="text-left px-4 py-2 font-semibold">Account</th>
                    <th className="text-right px-4 py-2 font-semibold">Open Items</th>
                    <th className="text-right px-4 py-2 font-semibold">Outstanding</th>
                    <th className="text-left px-4 py-2 font-semibold">Last Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {loading && Array.from({ length: 4 }).map((_, i) => (
                    <tr key={`s-${i}`}><td colSpan={5} className="px-4 py-2"><Skeleton className="h-6 w-full" /></td></tr>
                  ))}
                  {!loading && summary.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No AR accounts found.</td></tr>
                  )}
                  {!loading && summary.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{s.code}</td>
                      <td className="px-4 py-2">{s.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.open_count}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold">HK$ {fmt(s.outstanding)}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(s.last_activity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {loading && Array.from({ length: 3 }).map((_, i) => (
              <Card key={`ms-${i}`} className="card-glass p-4"><Skeleton className="h-14 w-full" /></Card>
            ))}
            {!loading && summary.length === 0 && (
              <Card className="card-glass p-6 text-center text-sm text-muted-foreground">No AR accounts found.</Card>
            )}
            {!loading && summary.map((s) => (
              <Card key={s.id} className="card-glass p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] text-muted-foreground">{s.code}</div>
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{s.open_count} open · {fmtDate(s.last_activity)}</div>
                  </div>
                  <div className="text-right tabular-nums text-sm font-semibold">HK$ {fmt(s.outstanding)}</div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="open-items" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9 h-9" placeholder="Search account, venue, memo…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" onClick={exportOpenCSV} className="h-9"><Download className="h-4 w-4 mr-1" /> CSV</Button>
          </div>

          {/* Desktop */}
          <Card className="card-glass p-0 overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Date</th>
                    <th className="text-left px-3 py-2 font-semibold">Account</th>
                    <th className="text-left px-3 py-2 font-semibold">Venue</th>
                    <th className="text-left px-3 py-2 font-semibold">Memo</th>
                    <th className="text-right px-3 py-2 font-semibold">Open</th>
                    <th className="text-right px-3 py-2 font-semibold whitespace-nowrap">Age</th>
                    <th className="text-left px-3 py-2 font-semibold">Bucket</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {loading && Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`s-${i}`}><td colSpan={8} className="px-3 py-2"><Skeleton className="h-6 w-full" /></td></tr>
                  ))}
                  {!loading && filteredOpen.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No open receivables.</td></tr>
                  )}
                  {!loading && filteredOpen.slice(0, 500).map((o) => {
                    const b = bucketOf(o.age_days);
                    return (
                      <tr key={o.line_id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDate(o.entry_date)}</td>
                        <td className="px-3 py-2 text-xs">
                          <span className="font-mono text-muted-foreground mr-1.5">{o.account_code}</span>{o.account_name}
                        </td>
                        <td className="px-3 py-2 text-xs">{o.venue || "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground max-w-[220px]" title={o.memo}>
                          <span className="line-clamp-2">{o.memo}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">HK$ {fmt(o.open_amount)}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{o.age_days}d</td>
                        <td className="px-3 py-2 text-xs">
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] border uppercase tracking-wide", bucketTone(b))}>{b}</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="ghost" className="h-9 min-w-[44px] text-xs" onClick={() => { setSelected(o); setDialogOpen(true); }}>Settle</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!loading && filteredOpen.length > 500 && (
                <div className="px-4 py-2 text-xs text-muted-foreground border-t">Showing first 500 of {filteredOpen.length} items. Use search to narrow.</div>
              )}
            </div>
          </Card>

          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {loading && Array.from({ length: 4 }).map((_, i) => (
              <Card key={`ms-${i}`} className="card-glass p-4"><Skeleton className="h-16 w-full" /></Card>
            ))}
            {!loading && filteredOpen.length === 0 && (
              <Card className="card-glass p-6 text-center text-sm text-muted-foreground">No open receivables.</Card>
            )}
            {!loading && filteredOpen.slice(0, 200).map((o) => {
              const b = bucketOf(o.age_days);
              return (
                <Card key={o.line_id} className="card-glass p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] border uppercase", bucketTone(b))}>{b}</span>
                        <span className="text-xs text-muted-foreground">{fmtDate(o.entry_date)} · {o.age_days}d</span>
                      </div>
                      <div className="text-sm font-medium mt-1">{o.account_name}</div>
                      <div className="text-xs text-muted-foreground">{o.venue || "—"}</div>
                      {o.memo && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{o.memo}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold tabular-nums">HK$ {fmt(o.open_amount)}</div>
                      <Button size="sm" variant="outline" className="h-9 mt-2 text-xs" onClick={() => { setSelected(o); setDialogOpen(true); }}>Settle</Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="aging" className="mt-4">
          <AgingMatrix title="AR Aging by Account" rows={agingRows} />
        </TabsContent>
      </Tabs>

      <SettleReceivableDialog item={selected} open={dialogOpen} onOpenChange={setDialogOpen} onSettled={refresh} />
    </div>
  );
}

function KPI({
  icon, label, value, sub, tone, onClick, loading,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "destructive" | "warning" | "primary";
  onClick?: () => void;
  loading?: boolean;
}) {
  const toneCls =
    tone === "destructive" ? "text-destructive" :
    tone === "warning" ? "text-warning" :
    tone === "primary" ? "text-primary" : "text-foreground";
  const tintCls =
    tone === "destructive" ? "bg-destructive/10" :
    tone === "warning" ? "bg-warning/10" :
    tone === "primary" ? "bg-primary/10" : "bg-muted";
  return (
    <Card
      className={cn("card-glass p-4 min-w-0", onClick && "cursor-pointer hover:ring-1 hover:ring-primary/30 transition")}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon && <span className={cn("h-6 w-6 rounded inline-flex items-center justify-center", tintCls, toneCls)}>{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-7 w-32 mt-1.5" />
      ) : (
        <div className={cn("text-xl font-display font-semibold tabular-nums mt-1", toneCls)}>{value}</div>
      )}
      {sub && !loading && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
    </Card>
  );
}
