import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle2, ArrowUpDown, ArrowDown, ArrowUp } from "lucide-react";
import type { PaymentProcessor, ProcessorMerchant, SettlementBatch, SettlementTransaction } from "@/hooks/usePaymentSettlements";
const fmtMoney = (v: number) =>
  Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type FeeRate = {
  id: string;
  payment_method: string;
  locality: string;
  merchant_number: string | null;
  wallet_type: string | null;
  rate: number;
  rounding_dp: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const roundTo = (n: number, dp: number) => {
  const factor = Math.pow(10, Math.max(0, dp | 0));
  return Math.round(n * factor) / factor;
};

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

function classifyPaymentMethod(rawMethod: string, rawLocality: string) {
  const method = norm(rawMethod);
  const locality = norm(rawLocality);
  const localityKey = locality === "domestic" ? "domestic" : locality === "foreign" ? "foreign" : "unknown";

  if (method.includes("visa")) return { key: method.includes("foreign") ? "visa_foreign" : "visa", locality: method.includes("foreign") ? "foreign" : localityKey === "unknown" ? "domestic" : localityKey };
  if (method.includes("master")) return { key: method.includes("foreign") ? "mastercard_foreign" : "mastercard", locality: method.includes("foreign") ? "foreign" : localityKey === "unknown" ? "domestic" : localityKey };
  if (method.includes("alipay")) return { key: "alipay", locality: "any" };
  if (method.includes("wechat") || method.includes("weixin")) return { key: "wechat", locality: "any" };
  if (method.includes("unionpay") || method.includes("union pay")) return { key: "union_pay", locality: localityKey === "unknown" ? "domestic" : localityKey };
  if (method.includes("payme")) return { key: "payme", locality: "any" };
  if (method.includes("amex") || method.includes("american express")) return { key: method.includes("foreign") || localityKey === "foreign" ? "amex_foreign" : "amex", locality: method.includes("foreign") || localityKey === "foreign" ? "foreign" : localityKey === "unknown" ? "domestic" : localityKey };
  if (method.includes("jcb")) return { key: method.includes("foreign") || localityKey === "foreign" ? "jcb_foreign" : "jcb", locality: method.includes("foreign") || localityKey === "foreign" ? "foreign" : localityKey === "unknown" ? "domestic" : localityKey };
  if (method.includes("fps")) return { key: "fps", locality: "any" };
  return { key: method.replace(/\s+/g, "_") || "other", locality: localityKey };
}

function findRate(rates: FeeRate[], method: string, locality: string, merchant: string, wallet: string | null) {
  const base = rates.filter((r) => r.payment_method === method && (r.locality === locality || r.locality === "any"));
  const w = norm(wallet);
  if (w) {
    const wm = base.filter((r) => norm(r.wallet_type) === w);
    const exact = wm.find((r) => r.merchant_number === merchant);
    if (exact) return exact;
    const any = wm.find((r) => !r.merchant_number);
    if (any) return any;
  }
  const noW = base.filter((r) => !r.wallet_type);
  const exact = noW.find((r) => r.merchant_number === merchant);
  return exact || noW.find((r) => !r.merchant_number) || null;
}

const fmtDateTime = (s: string) => {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
};

const STATUS_STYLE: Record<string, string> = {
  ok: "chip chip-success",
  rate_off: "chip chip-warn",
  unknown_pm: "chip chip-danger",
};
const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  rate_off: "Rate off",
  unknown_pm: "Unknown PM",
};

type SortKey = "time" | "merchant" | "method" | "gross" | "fee" | "expected" | "variance";
type SortDir = "asc" | "desc";

export function SettlementDetailsAuditTab({
  processor, merchants, batches, transactions,
}: {
  processor: PaymentProcessor | null;
  merchants: ProcessorMerchant[];
  batches: SettlementBatch[];
  transactions: SettlementTransaction[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [rates, setRates] = useState<FeeRate[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadRates = async () => {
      if (!processor) {
        setRates([]);
        return;
      }

      const { data } = await supabase
        .from("payment_processor_fee_rates")
        .select("id, payment_method, locality, merchant_number, rate, rounding_dp")
        .eq("processor_id", processor.id);

      if (!cancelled) setRates((data || []) as FeeRate[]);
    };

    loadRates();
    return () => {
      cancelled = true;
    };
  }, [processor]);

  const merchantById = useMemo(() => {
    const m = new Map<string, ProcessorMerchant>();
    merchants.forEach((x) => m.set(x.id, x));
    return m;
  }, [merchants]);

  const batchById = useMemo(() => {
    const m = new Map<string, SettlementBatch>();
    batches.forEach((b) => m.set(b.id, b));
    return m;
  }, [batches]);

  const enriched = useMemo(() => {
    return transactions.map((t) => {
      const batch = batchById.get(t.batch_id);
      const merchant = batch ? merchantById.get(batch.merchant_id) : undefined;
      const classified = classifyPaymentMethod(t.payment_method_raw, t.locality);
      const methodKey = t.payment_method_key || classified.key;
      const localityKey = ["domestic", "foreign", "any"].includes(norm(t.locality)) ? norm(t.locality) : classified.locality;
      const rate = findRate(rates, methodKey, localityKey, t.merchant_number);
      const expectedFeeComputed = rate
        ? -roundTo(Number(t.gross_amount || 0) * Number(rate.rate || 0), rate.rounding_dp ?? 2)
        : 0;
      const feeVarianceComputed = round2(Number(t.fee_amount || 0) - expectedFeeComputed);
      const auditStatusComputed = !rate ? "unknown_pm" : Math.abs(feeVarianceComputed) > 0.01 ? "rate_off" : "ok";

      return {
        ...t,
        merchantLabel: merchant?.display_name || t.merchant_number || "?",
        expectedFeeComputed,
        feeVarianceComputed,
        auditStatusComputed,
      };
    });
  }, [transactions, batchById, merchantById, rates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((t) => {
      if (statusFilter !== "all" && t.auditStatusComputed !== statusFilter) return false;
      if (!q) return true;
      return (
        t.merchantLabel.toLowerCase().includes(q) ||
        t.merchant_number.toLowerCase().includes(q) ||
        t.payment_method_raw.toLowerCase().includes(q)
      );
    });
  }, [enriched, search, statusFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sortKey) {
        case "time": return a.transaction_time.localeCompare(b.transaction_time) * dir;
        case "merchant": return a.merchantLabel.localeCompare(b.merchantLabel) * dir;
        case "method": return a.payment_method_raw.localeCompare(b.payment_method_raw) * dir;
        case "gross": return (a.gross_amount - b.gross_amount) * dir;
        case "fee": return (a.fee_amount - b.fee_amount) * dir;
        case "expected": return (a.expectedFeeComputed - b.expectedFeeComputed) * dir;
        case "variance": return (a.feeVarianceComputed - b.feeVarianceComputed) * dir;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    let gross = 0, actual = 0, expected = 0, variance = 0, flagged = 0;
    filtered.forEach((t) => {
      gross += Number(t.gross_amount || 0);
      actual += Number(t.fee_amount || 0);
      expected += Number(t.expectedFeeComputed || 0);
      if (t.auditStatusComputed !== "ok") {
        flagged += 1;
        variance += Number(t.feeVarianceComputed || 0);
      }
    });
    return { count: filtered.length, gross, actual, expected, variance: round2(variance), flagged };
  }, [filtered]);

  const onSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "time" ? "desc" : "asc"); }
  };

  if (!processor) return <Card className="card-glass p-6 text-sm text-muted-foreground">Choose a processor.</Card>;
  if (transactions.length === 0)
    return (
      <Card className="card-glass p-6 text-sm text-muted-foreground text-center">
        No transactions yet. Upload &amp; commit a settlement under <strong>Imports</strong> to populate this view.
      </Card>
    );

  const ok = totals.flagged === 0;

  return (
    <Card className="card-glass p-4 space-y-3">
      {ok ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 p-2.5 text-xs flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> All transactions were charged at the contracted KPay fee rates.
        </div>
      ) : (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-600 p-2.5 text-xs flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          {totals.flagged} transaction(s) flagged. Net Δ {fmtMoney(totals.variance)}.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <Stat label="Transactions" value={String(totals.count)} />
        <Stat label="Gross" value={fmtMoney(totals.gross)} />
        <Stat label="Expected fee" value={fmtMoney(totals.expected)} />
        <Stat label="Actual fee" value={fmtMoney(totals.actual)} />
        <Stat label="Δ" value={fmtMoney(totals.variance)} tone={totals.flagged > 0 ? "warn" : "ok"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search merchant, method…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 max-w-sm text-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ok">OK only</SelectItem>
            <SelectItem value="rate_off">Rate off</SelectItem>
            <SelectItem value="unknown_pm">Unknown PM</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground ml-auto">
          {sorted.length} of {transactions.length} transactions
        </span>
      </div>

      <div className="rounded-md border border-border/40 overflow-auto max-h-[60vh]">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 uppercase tracking-wider text-[10px] text-muted-foreground sticky top-0">
            <tr>
              <Th label="Txn time" k="time" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <Th label="Merchant" k="merchant" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <Th label="Payment method" k="method" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="text-left px-2 py-1.5">Locality</th>
              <Th label="Gross" k="gross" right sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <Th label="Actual fee" k="fee" right sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <Th label="Expected" k="expected" right sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <Th label="Δ" k="variance" right sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="text-left px-2 py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const flagged = t.auditStatusComputed !== "ok";
              return (
                <tr key={t.id} className={`border-t border-border/40 ${flagged ? "bg-amber-500/5" : ""}`}>
                  <td className="px-2 py-1.5 td-num whitespace-nowrap">{fmtDateTime(t.transaction_time)}</td>
                  <td className="px-2 py-1.5">
                    <div className="font-medium">{t.merchantLabel}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{t.merchant_number}</div>
                  </td>
                  <td className="px-2 py-1.5">{t.payment_method_raw}</td>
                  <td className="px-2 py-1.5 capitalize text-muted-foreground">{t.locality || "—"}</td>
                  <td className="px-2 py-1.5 text-right td-num">{fmtMoney(t.gross_amount)}</td>
                  <td className="px-2 py-1.5 text-right td-num">{fmtMoney(t.fee_amount)}</td>
                  <td className="px-2 py-1.5 text-right td-num text-muted-foreground">{fmtMoney(t.expectedFeeComputed)}</td>
                  <td className={`px-2 py-1.5 text-right td-num ${Math.abs(Number(t.feeVarianceComputed)) > 0.01 ? "text-amber-500 font-medium" : ""}`}>{fmtMoney(t.feeVarianceComputed)}</td>
                  <td className="px-2 py-1.5">
                    <span className={STATUS_STYLE[t.auditStatusComputed] || STATUS_STYLE.ok}>{STATUS_LABEL[t.auditStatusComputed] || t.auditStatusComputed}</span>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={9} className="text-center text-muted-foreground py-6">No transactions match your filters.</td></tr>
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
