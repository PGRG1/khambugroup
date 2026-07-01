import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useBankModule, type BankTxn, type BankAccount } from "@/hooks/useBankModule";
import { BankPageShell, BankKpi, fmtMoney, fmtDate } from "@/components/bank/BankShell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronRight } from "lucide-react";

const SETTLED = new Set(["matched", "cleared", "approved", "posted"]);

function sourceBadge(t: BankTxn) {
  const src = (t as any).source as string | null | undefined;
  if (src === "manual" || (!src && t.is_manual === true)) {
    return <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/15 text-purple-300">Manual</span>;
  }
  if (src === "system") {
    return <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-teal-500/15 text-teal-300">System</span>;
  }
  return <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-sky-500/15 text-sky-300">Statement</span>;
}

function isSystemUnconfirmed(t: BankTxn) {
  const src = (t as any).source as string | null | undefined;
  return src === "system" && !SETTLED.has(t.status);
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export default function BankDashboard() {
  const { accounts, transactions, imports, currentBalanceFor } = useBankModule();
  const [venue, setVenue] = useState<string>("all");

  const venues = useMemo(
    () => Array.from(new Set(accounts.map((a) => a.venue).filter((v): v is string => !!v))),
    [accounts],
  );

  const filteredAccounts = useMemo(
    () => (venue === "all" ? accounts : accounts.filter((a) => a.venue === venue)),
    [accounts, venue],
  );
  const acctIds = useMemo(() => new Set(filteredAccounts.map((a) => a.id)), [filteredAccounts]);
  const filteredTxns = useMemo(
    () => transactions.filter((t) => acctIds.has(t.bank_account_id)),
    [transactions, acctIds],
  );

  const latestImportFor = (acctId: string) =>
    imports
      .filter((i) => i.bank_account_id === acctId)
      .sort((a, b) => (a.period_end < b.period_end ? 1 : -1))[0];

  const today = new Date();
  const freshnessDays = (acct: BankAccount): number | null => {
    const li = latestImportFor(acct.id);
    if (!li) return null;
    return daysBetween(today, new Date(li.period_end));
  };

  const totalCash = filteredAccounts.reduce((s, a) => s + currentBalanceFor(a.id), 0);
  const unmatchedCount = filteredTxns.filter(
    (t) => !t.matched_record_id && ["unmatched", "pending", "imported"].includes(t.status),
  ).length;
  const needUploadCount = filteredAccounts.filter((a) => {
    const d = freshnessDays(a);
    return d === null || d > 30;
  }).length;
  const pendingConfirmCount = filteredTxns.filter(isSystemUnconfirmed).length;

  // Action queue metrics
  const staleAccounts = filteredAccounts.filter((a) => {
    const d = freshnessDays(a);
    return d === null || d > 30;
  });
  const mostOverdue = staleAccounts
    .map((a) => ({ a, d: freshnessDays(a) ?? 99999 }))
    .sort((x, y) => y.d - x.d)[0];

  const unmatchedTxns = filteredTxns.filter(
    (t) => !t.matched_record_id && ["unmatched", "pending", "imported"].includes(t.status),
  );
  const oldestUnmatched = [...unmatchedTxns].sort((a, b) => (a.txn_date < b.txn_date ? -1 : 1))[0];

  const lowConfidenceCount = filteredTxns.filter(
    (t) => t.match_confidence === "low" && !t.matched_record_id,
  ).length;

  const recent = [...filteredTxns]
    .sort((a, b) => (a.txn_date < b.txn_date ? 1 : -1))
    .slice(0, 8);

  return (
    <BankPageShell
      title="Bank"
      description="Cash position as of last statement upload."
      actions={
        <Select value={venue} onValueChange={setVenue}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Venue" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All venues</SelectItem>
            {venues.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BankKpi label="Total system cash" value={fmtMoney(totalCash)} tone="warn" />
        <BankKpi
          label="Unmatched transactions"
          value={unmatchedCount}
          tone={unmatchedCount > 0 ? "warn" : "default"}
        />
        <BankKpi
          label="Accounts needing upload"
          value={needUploadCount}
          tone={needUploadCount > 0 ? "danger" : "default"}
        />
        <BankKpi label="Pending confirmation" value={pendingConfirmCount} tone="info" />
      </div>

      {/* Account cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAccounts.map((a) => {
          const d = freshnessDays(a);
          const li = latestImportFor(a.id);
          const borderClass =
            d === null || d > 30
              ? "border-red-500"
              : d <= 7
              ? "border-emerald-500"
              : "border-amber-500";
          const freshText =
            d === null
              ? <span className="text-red-400">Never reconciled</span>
              : (
                <span className={d > 30 ? "text-red-400" : d > 7 ? "text-amber-400" : "text-emerald-400"}>
                  Last import {fmtDate(li!.period_end)} · {d} day{d === 1 ? "" : "s"} ago
                </span>
              );
          const fresh = d !== null && d <= 30;
          return (
            <div
              key={a.id}
              className={`card-glass rounded-none border-l-2 ${borderClass} p-4 flex flex-col gap-2`}
            >
              <div>
                <div className="font-semibold text-sm">{a.account_name}</div>
                <div className="text-xs text-muted-foreground">
                  {a.bank_name} · {a.currency}
                </div>
              </div>
              <div className="text-2xl font-mono font-semibold tabular-nums td-num">
                {fmtMoney(currentBalanceFor(a.id), a.currency)}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                System balance
              </div>
              <div className="text-xs">{freshText}</div>
              <div className="mt-auto pt-2">
                {fresh ? (
                  <Button asChild variant="ghost" size="sm" className="w-full">
                    <Link to="/bank/transactions">View transactions</Link>
                  </Button>
                ) : (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="w-full border-amber-500/50 text-amber-300 hover:bg-amber-500/10"
                  >
                    <Link to="/bank/reconciliation">Upload statement</Link>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {!filteredAccounts.length && (
          <div className="col-span-full card-glass rounded-xl p-8 text-center text-sm text-muted-foreground">
            No bank accounts yet.
          </div>
        )}
      </div>

      {/* Bottom two panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Action queue */}
        <div className="card-glass rounded-xl p-4">
          <div className="font-semibold text-sm mb-3">Action queue</div>
          <div className="space-y-1">
            <ActionRow
              to="/bank/reconciliation"
              count={staleAccounts.length}
              label={`Upload statement for ${staleAccounts.length} account${staleAccounts.length === 1 ? "" : "s"}`}
              sub={
                mostOverdue
                  ? `Most overdue: ${mostOverdue.a.account_name} · ${mostOverdue.d === 99999 ? "never" : `${mostOverdue.d} days`}`
                  : "All accounts up to date"
              }
            />
            <ActionRow
              to="/bank/matching"
              count={unmatchedTxns.length}
              label={`Match ${unmatchedTxns.length} unmatched transaction${unmatchedTxns.length === 1 ? "" : "s"}`}
              sub={oldestUnmatched ? `Oldest: ${fmtDate(oldestUnmatched.txn_date)}` : "Nothing pending"}
            />
            <ActionRow
              to="/bank/matching"
              count={lowConfidenceCount}
              label={`${lowConfidenceCount} suggested match${lowConfidenceCount === 1 ? "" : "es"} need review`}
              sub="Low confidence auto-suggestions"
            />
            <ActionRow
              to="/bank/transactions"
              count={pendingConfirmCount}
              label={`${pendingConfirmCount} system transaction${pendingConfirmCount === 1 ? "" : "s"} awaiting bank confirmation`}
              sub="Recorded internally, not yet on statement"
            />
          </div>
        </div>

        {/* Recent activity */}
        <div className="card-glass rounded-xl p-4 flex flex-col">
          <div className="font-semibold text-sm mb-3">Recent activity</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40">
                <th className="text-left px-2 py-1.5 font-medium">Date</th>
                <th className="text-left px-2 py-1.5 font-medium">Description</th>
                <th className="text-left px-2 py-1.5 font-medium">Source</th>
                <th className="text-right px-2 py-1.5 font-medium">In</th>
                <th className="text-right px-2 py-1.5 font-medium">Out</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t, i) => (
                <tr key={t.id} className={i % 2 === 1 ? "bg-muted/30" : ""}>
                  <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(t.txn_date)}</td>
                  <td className="px-2 py-1.5 max-w-[220px] truncate">
                    {(t.description || "").length > 28 ? (t.description || "").slice(0, 28) + "…" : t.description}
                  </td>
                  <td className="px-2 py-1.5">{sourceBadge(t)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-mono text-emerald-400">
                    {Number(t.money_in) > 0 ? fmtMoney(t.money_in, "") : ""}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-mono text-red-400">
                    {Number(t.money_out) > 0 ? fmtMoney(t.money_out, "") : ""}
                  </td>
                </tr>
              ))}
              {!recent.length && (
                <tr>
                  <td colSpan={5} className="text-center text-muted-foreground py-6">
                    No transactions yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="mt-auto pt-3 text-right">
            <Link to="/bank/transactions" className="text-xs text-primary hover:underline">
              View all →
            </Link>
          </div>
        </div>
      </div>
    </BankPageShell>
  );
}

function ActionRow({
  to,
  count,
  label,
  sub,
}: {
  to: string;
  count: number;
  label: string;
  sub: string;
}) {
  const muted = count === 0;
  return (
    <Link
      to={to}
      className={`flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5 hover:bg-accent/40 transition ${muted ? "opacity-50" : ""}`}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{label}</div>
        <div className="text-xs text-muted-foreground truncate">{sub}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
    </Link>
  );
}
