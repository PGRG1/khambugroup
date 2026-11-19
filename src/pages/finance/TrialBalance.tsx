import { shortMoney } from '@/utils/revenueOverview';
import { Fragment, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTrialBalance } from "@/hooks/useTrialBalance";
import { useFinancePeriod } from "@/components/kit/PeriodControl";
import { PageTop } from "@/components/kit/PageTop";
import { Toolbar } from "@/components/kit/Toolbar";
import { DownloadMenu } from "@/components/kit/DownloadMenu";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight } from "lucide-react";
import { downloadCSV } from "@/utils/csvDownload";
import { ACCOUNT_TYPE_LABEL } from "@/hooks/useChartOfAccounts";
import { generateTrialBalancePDF } from "@/utils/financePdfReports";
import { formatTableCurrency, formatTableInteger } from "@/utils/format";
import { shortDay, tenantToday } from "@/utils/salesRecordChecks";
import { Hero, Section, PhoneRow, GroupHead, Note, Empty, keyOpen } from "@/components/finance/accounting/AccountingKit";

const TYPE_ORDER = ["asset", "liability", "equity", "revenue", "cogs", "opex", "other_income", "other_expense"];
const FRIENDLY: Record<string, string> = { asset: "What you own", liability: "What you owe", equity: "Owner's equity", revenue: "Income", cogs: "Cost of sales", opex: "Running costs", other_income: "Other income", other_expense: "Other costs" };
const lastMonthEnd = (iso: string) => { const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`); d.setUTCDate(0); return d.toISOString().slice(0, 10); };

// Trial balance: as at a date, every account's net balance in the debit or credit column, grouped by type.
// The summary says whether debits equal credits; Compare adds last month end beside each account.
export default function TrialBalance() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const period = useFinancePeriod("asat");
  const toDate = period.toIso ?? tenantToday();
  const compareOn = params.get("compare") !== "off";
  const [search, setSearch] = useState("");
  const toggleCompare = () => { const next = new URLSearchParams(params); if (compareOn) next.set("compare", "off"); else next.delete("compare"); setParams(next, { replace: true }); };

  const { rows, loading } = useTrialBalance({ fromDate: undefined, toDate });
  const priorTo = lastMonthEnd(toDate);
  const { rows: priorRows, loading: priorLoading } = useTrialBalance(compareOn ? { fromDate: undefined, toDate: priorTo } : { fromDate: undefined, toDate: undefined });
  const net = (r: { total_debit: number | string; total_credit: number | string }) => Number(r.total_debit) - Number(r.total_credit);
  const prior = useMemo(() => new Map(compareOn ? priorRows.map(r => [r.account_id, net(r)] as const) : []), [priorRows, compareOn]);

  const active = rows.filter(r => Math.abs(net(r)) > 0.005 || Math.abs(prior.get(r.account_id) ?? 0) > 0.005);
  const shown = active.filter(r => !search || `${r.code} ${r.name}`.toLowerCase().includes(search.toLowerCase()));
  const groups = TYPE_ORDER.map(t => ({ t, list: shown.filter(r => r.account_type === t).sort((a, b) => a.code.localeCompare(b.code)) })).filter(g => g.list.length);
  const debit = active.reduce((n, r) => n + Math.max(net(r), 0), 0), credit = active.reduce((n, r) => n + Math.max(-net(r), 0), 0);
  const diff = debit - credit, balanced = Math.abs(diff) < 0.005;
  const money = (n: number) => Math.abs(n) < 0.005 ? "—" : formatTableCurrency(n);
  const side = (n: number) => Math.abs(n) < 0.005 ? "—" : `${formatTableCurrency(Math.abs(n))}${n < 0 ? " Cr" : ""}`;
  const open = (accountId: string) => navigate(`/finance/books?view=ledger&account=${accountId}`);

  const download = (f: "csv" | "pdf" | "excel") => {
    if (f === "pdf") {
      generateTrialBalancePDF({ fromDate: undefined, toDate, rows: rows as any, totalDebit: debit, totalCredit: credit,
        groups: TYPE_ORDER.map(t => ({ type: t, label: ACCOUNT_TYPE_LABEL[t as keyof typeof ACCOUNT_TYPE_LABEL], rows: active.filter(r => r.account_type === t).map(r => ({ code: r.code, name: r.name, account_type: r.account_type, total_debit: Math.max(net(r), 0), total_credit: Math.max(-net(r), 0), balance: net(r) })) })).filter(g => g.rows.length) });
      return;
    }
    downloadCSV(active.map(r => ({ code: r.code, name: r.name, type: ACCOUNT_TYPE_LABEL[r.account_type as keyof typeof ACCOUNT_TYPE_LABEL], debit: Math.max(net(r), 0).toFixed(2), credit: Math.max(-net(r), 0).toFixed(2), prior: (prior.get(r.account_id) ?? 0).toFixed(2) })),
      [{ key: "code", label: "Code" }, { key: "name", label: "Account" }, { key: "type", label: "Type" }, { key: "debit", label: "Debit" }, { key: "credit", label: "Credit" }, ...(compareOn ? [{ key: "prior", label: `Last month end (${priorTo})` }] : [])], `trial_balance_${toDate}`);
  };

  return <div className="min-w-0 space-y-5 max-sm:space-y-3">
    <PageTop tabsAbove title="Trial balance" period={period.control} actions={<Button variant="outline" size="sm" className="h-10" aria-pressed={compareOn} onClick={toggleCompare}><ArrowLeftRight className="h-4 w-4" />{compareOn ? "Comparing" : "Compare"}</Button>} />
    <Hero aria="Trial balance summary" busy={loading} label={shortDay(toDate)} check={balanced ? "Balances" : `Off by ${shortMoney(Math.abs(diff))}`} checkTone={balanced ? "ok" : "amber"}
      stats={[{ label: "Trial balance", value: shortMoney(debit) }, { label: "Debits", value: shortMoney(debit) }, { label: "Credits", value: shortMoney(credit) }, { label: "Accounts", value: formatTableInteger(active.length) }]} />
    <Section title="Accounts" detail="grouped by type" busy={loading}>
      <Toolbar search={search} onSearch={setSearch} placeholder="Search accounts" mobileSearchBelow downloadControl={<DownloadMenu formats={["csv", "pdf"]} onDownload={download} label="Download trial balance" />} />
      <div className="min-[768px]:hidden kit">{groups.map(g => <Fragment key={g.t}><GroupHead name={FRIENDLY[g.t] ?? g.t} />
        <ul className="divide-y divide-border/60 border-t border-border/60">{g.list.map(r => <PhoneRow key={r.account_id} title={r.name} amount={side(net(r))} sub={compareOn ? `${r.code} · last month end ${priorLoading ? "…" : side(prior.get(r.account_id) ?? 0)}` : r.code} onOpen={() => open(r.account_id)} />)}</ul></Fragment>)}</div>
      <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Trial balance table"><table className="sales-table" aria-label="Trial balance">
        <thead><tr><th scope="col" className="sales-cell-left">Code</th><th scope="col" className="sales-cell-left">Account</th><th scope="col" className="sales-cell-right">Debit</th><th scope="col" className="sales-cell-right">Credit</th>{compareOn && <th scope="col" className="sales-cell-right">Last month end</th>}</tr></thead>
        <tbody>{groups.map(g => <Fragment key={g.t}>
          <tr className="sales-week-row"><th colSpan={compareOn ? 5 : 4}><span>{FRIENDLY[g.t] ?? g.t}</span></th></tr>
          {g.list.map(r => <tr key={r.account_id} className="sales-record-row" {...keyOpen(() => open(r.account_id))}>
            <td className="sales-cell-left">{r.code}</td>
            <td className="sales-cell-left" title={r.name}>{r.name}</td>
            <td className="kit-num">{money(Math.max(net(r), 0))}</td>
            <td className="kit-num">{money(Math.max(-net(r), 0))}</td>
            {compareOn && <td className="kit-num text-muted-foreground">{priorLoading ? "…" : side(prior.get(r.account_id) ?? 0)}</td>}
          </tr>)}</Fragment>)}
          {!!groups.length && !search && <tr className="sales-week-row"><th colSpan={2}><span>Total</span></th><td className="kit-num font-semibold">{formatTableCurrency(debit)}</td><td className="kit-num font-semibold">{formatTableCurrency(credit)}</td>{compareOn && <td />}</tr>}
        </tbody></table></div>
      {!groups.length && <Empty>{loading ? "Loading accounts…" : search ? "Nothing matches your search." : "No posted entries yet."}</Empty>}
      <Note>Each account's balance sits in its debit or credit column. {compareOn ? `Last month end is ${shortDay(priorTo)}. ` : ""}Tap an account for its ledger.</Note>
    </Section>
  </div>;
}
