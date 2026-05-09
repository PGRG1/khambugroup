import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import type {
  PaymentProcessor,
  ProcessorMerchant,
  SettlementBatch,
  SettlementLine,
  SettlementTransaction,
} from "@/hooks/usePaymentSettlements";

const fmtMoney = (v: number) =>
  Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (s: string) => {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const STATUS_STYLE: Record<string, string> = {
  matched: "chip chip-success",
  unmatched: "chip chip-warn",
  parsed: "chip chip-info",
  pending: "chip chip-neutral",
};

type SortKey = "settle" | "txn" | "merchant" | "gross" | "fees" | "net" | "lines";
type SortDir = "asc" | "desc";

export function SettlementBatchesTab({
  processor, merchants, batches, lines, transactions,
}: {
  processor: PaymentProcessor | null;
  merchants: ProcessorMerchant[];
  batches: SettlementBatch[];
  lines: SettlementLine[];
  transactions: SettlementTransaction[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [merchantFilter, setMerchantFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("settle");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const merchantById = useMemo(() => {
    const m = new Map<string, ProcessorMerchant>();
    merchants.forEach((x) => m.set(x.id, x));
    return m;
  }, [merchants]);

  const linesByBatch = useMemo(() => {
    const m = new Map<string, SettlementLine[]>();
    lines.forEach((l) => {
      const arr = m.get(l.batch_id) || [];
      arr.push(l);
      m.set(l.batch_id, arr);
    });
    return m;
  }, [lines]);

  const txnCountByBatch = useMemo(() => {
    const m = new Map<string, number>();
    transactions.forEach((t) => m.set(t.batch_id, (m.get(t.batch_id) || 0) + 1));
    return m;
  }, [transactions]);

  const enriched = useMemo(() => {
    return batches.map((b) => {
      const merch = merchantById.get(b.merchant_id);
      const bLines = linesByBatch.get(b.id) || [];
      const fees = Math.abs(Number(b.fee_amount || 0)) + Math.abs(Number(b.bank_transfer_fee || 0));
      return {
        ...b,
        merchantLabel: merch?.display_name || "?",
        merchantNumber: merch?.merchant_number || "—",
        venue: merch?.shared_venues?.length ? merch.shared_venues.join(" + ") : (merch?.venue || "—"),
        feesTotal: fees,
        lineCount: bLines.length,
        txnCount: txnCountByBatch.get(b.id) || 0,
      };
    });
  }, [batches, merchantById, linesByBatch, txnCountByBatch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (merchantFilter !== "all" && b.merchant_id !== merchantFilter) return false;
      if (!q) return true;
      return (
        b.merchantLabel.toLowerCase().includes(q) ||
        b.merchantNumber.toLowerCase().includes(q) ||
        b.venue.toLowerCase().includes(q)
      );
    });
  }, [enriched, search, statusFilter, merchantFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sortKey) {
        case "settle": return a.settlement_date.localeCompare(b.settlement_date) * dir;
        case "txn": return a.transaction_date.localeCompare(b.transaction_date) * dir;
        case "merchant": return a.merchantLabel.localeCompare(b.merchantLabel) * dir;
        case "gross": return (Number(a.gross_amount) - Number(b.gross_amount)) * dir;
        case "fees": return (a.feesTotal - b.feesTotal) * dir;
        case "net": return (Number(a.net_settlement) - Number(b.net_settlement)) * dir;
        case "lines": return (a.lineCount - b.lineCount) * dir;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    let gross = 0, fees = 0, net = 0, unmatched = 0;
    filtered.forEach((b) => {
      gross += Number(b.gross_amount || 0);
      fees += b.feesTotal;
      net += Number(b.net_settlement || 0);
      if (b.status === "unmatched") unmatched += 1;
    });
    return { count: filtered.length, gross, fees, net, unmatched };
  }, [filtered]);

  const onSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "merchant" ? "asc" : "desc"); }
  };

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!processor) return <Card className="card-glass p-6 text-sm text-muted-foreground">Choose a processor.</Card>;
  if (batches.length === 0)
    return (
      <Card className="card-glass p-6 text-sm text-muted-foreground text-center">
        No settlement batches yet. Upload &amp; commit a settlement under <strong>Imports</strong> to populate this view.
      </Card>
    );

  return (
    <Card className="card-glass p-4 space-y-3">
      <p className="text-xs text-muted-foreground">
        Each row is one settlement batch — one merchant's net deposit for a settlement date. Expand a row to see the
        per-payment-type breakdown. Use the status to track which batches still need to be matched against a bank deposit.
      </p>

      {totals.unmatched === 0 ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 p-2.5 text-xs flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> All batches in view are matched or cleared.
        </div>
      ) : (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-600 p-2.5 text-xs flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" /> {totals.unmatched} batch(es) still unmatched against bank deposits.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <Stat label="Batches" value={String(totals.count)} />
        <Stat label="Gross" value={fmtMoney(totals.gross)} />
        <Stat label="Fees" value={fmtMoney(totals.fees)} />
        <Stat label="Net settled" value={fmtMoney(totals.net)} />
        <Stat label="Unmatched" value={String(totals.unmatched)} tone={totals.unmatched > 0 ? "warn" : "ok"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search merchant, venue…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 max-w-sm text-xs"
        />
        <Select value={merchantFilter} onValueChange={setMerchantFilter}>
          <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All merchants</SelectItem>
            {merchants.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="matched">Matched</SelectItem>
            <SelectItem value="unmatched">Unmatched</SelectItem>
            <SelectItem value="parsed">Parsed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground ml-auto">
          {sorted.length} of {batches.length} batches
        </span>
      </div>

      <div className="rounded-md border border-border/40 overflow-auto max-h-[65vh]">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 uppercase tracking-wider text-[10px] text-muted-foreground sticky top-0">
            <tr>
              <th className="w-6 px-2 py-1.5"></th>
              <Th label="Settle" k="settle" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <Th label="Txn date" k="txn" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <Th label="Merchant" k="merchant" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="text-left px-2 py-1.5">Venue</th>
              <Th label="Lines" k="lines" right sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="text-right px-2 py-1.5">Txns</th>
              <Th label="Gross" k="gross" right sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <Th label="Fees" k="fees" right sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <Th label="Net" k="net" right sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="text-left px-2 py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => {
              const isOpen = expanded.has(b.id);
              const bLines = linesByBatch.get(b.id) || [];
              return (
                <>
                  <tr
                    key={b.id}
                    className={`border-t border-border/40 cursor-pointer hover:bg-muted/30 ${b.status === "unmatched" ? "bg-amber-500/5" : ""}`}
                    onClick={() => toggle(b.id)}
                  >
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </td>
                    <td className="px-2 py-1.5 td-num whitespace-nowrap">{fmtDate(b.settlement_date)}</td>
                    <td className="px-2 py-1.5 td-num whitespace-nowrap text-muted-foreground">{fmtDate(b.transaction_date)}</td>
                    <td className="px-2 py-1.5">
                      <div className="font-medium">{b.merchantLabel}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{b.merchantNumber}</div>
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{b.venue}</td>
                    <td className="px-2 py-1.5 text-right td-num">{b.lineCount}</td>
                    <td className="px-2 py-1.5 text-right td-num text-muted-foreground">{b.txnCount}</td>
                    <td className="px-2 py-1.5 text-right td-num">{fmtMoney(b.gross_amount)}</td>
                    <td className="px-2 py-1.5 text-right td-num text-muted-foreground">{fmtMoney(b.feesTotal)}</td>
                    <td className="px-2 py-1.5 text-right td-num font-medium">{fmtMoney(b.net_settlement)}</td>
                    <td className="px-2 py-1.5">
                      <span className={STATUS_STYLE[b.status] || "chip chip-neutral"}>{b.status}</span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-muted/10">
                      <td></td>
                      <td colSpan={10} className="px-3 py-2">
                        {bLines.length === 0 ? (
                          <div className="text-[11px] text-muted-foreground italic">No detail lines for this batch.</div>
                        ) : (
                          <div className="rounded border border-border/40 overflow-hidden">
                            <table className="w-full text-[11px]">
                              <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                                <tr>
                                  <th className="text-left px-2 py-1">Payment type</th>
                                  <th className="text-right px-2 py-1">#</th>
                                  <th className="text-right px-2 py-1">Gross</th>
                                  <th className="text-right px-2 py-1">Fee</th>
                                  <th className="text-right px-2 py-1">Net</th>
                                </tr>
                              </thead>
                              <tbody>
                                {bLines.map((l) => (
                                  <tr key={l.id} className="border-t border-border/30">
                                    <td className="px-2 py-1">{l.payment_type_label || l.payment_type}</td>
                                    <td className="px-2 py-1 text-right td-num">{l.count}</td>
                                    <td className="px-2 py-1 text-right td-num">{fmtMoney(l.gross_amount)}</td>
                                    <td className="px-2 py-1 text-right td-num text-muted-foreground">{fmtMoney(l.fee_amount)}</td>
                                    <td className="px-2 py-1 text-right td-num">{fmtMoney(l.net_amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {b.notes && (
                          <div className="text-[11px] text-muted-foreground mt-2"><b>Notes:</b> {b.notes}</div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={11} className="text-center text-muted-foreground py-6">No batches match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Th({ label, k, right, sortKey, sortDir, onSort }: {
  label: string; k: SortKey; right?: boolean;
  sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : (sortDir === "asc" ? ArrowUp : ArrowDown);
  return (
    <th
      onClick={() => onSort(k)}
      className={`px-2 py-1.5 cursor-pointer select-none ${right ? "text-right" : "text-left"}`}
    >
      <span className={`inline-flex items-center gap-1 ${active ? "text-foreground" : ""}`}>
        {label}
        <Icon className="h-3 w-3 opacity-60" />
      </span>
    </th>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${tone === "warn" ? "border-amber-500/40 bg-amber-500/10" : "border-border/40 bg-muted/20"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`td-num font-medium ${tone === "warn" ? "text-amber-500" : ""}`}>{value}</div>
    </div>
  );
}
