import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Ledger from "./Ledger";
import Journal from "./Journal";
import TrialBalance from "./TrialBalance";
import ChartOfAccounts from "./ChartOfAccounts";
import LedgerAuditLog from "./LedgerAuditLog";
import DocumentCentre from "./DocumentCentre";
import { SectionPillRow } from '@/components/kit/SectionPillRow';
import './books.css';
const views = [
  ["journal", "Journal"],
  ["ledger", "Ledger"],
  ["trial-balance", "Trial balance"],
  ["chart-of-accounts", "Accounts"],
  ["schedules", "Schedules"],
  ["tax", "Tax"],
  ["documents", "Documents"],
  ["ledger-audit", "Audit"],
];
export default function Books() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "journal";
  return (
    <div className="books-page min-w-0 space-y-3">
      <h1 className="font-display text-2xl font-semibold">Books</h1>
      <div className="md:hidden"><SectionPillRow label="Books views" items={views.map(([key,label])=>({label,path:`/finance/books?view=${key}`}))} activePath={`/finance/books?view=${view}`}/></div>
      <div className="hidden md:flex flex-wrap gap-1 border-b border-border">
        {views.map(([key, label]) => (
          <Button
            key={key}
            variant="ghost"
            className={`rounded-none border-b-2 ${view === key ? "border-primary" : "border-transparent"}`}
            onClick={() => { const next = new URLSearchParams(params); next.set('view',key); next.delete('issue'); next.delete('entry'); setParams(next); }}
          >
            {label}
          </Button>
        ))}
      </div>
      {view === "journal" ? (
        <Journal />
      ) : view === "trial-balance" ? (
        <TrialBalance />
      ) : view === "chart-of-accounts" ? (
        <ChartOfAccounts />
      ) : view === "schedules" || view === "tax" ? (
        <section className="kit card-glass p-4"><h2 className="font-semibold mb-4">{view === 'tax' ? 'Tax setup' : 'Schedules'}</h2><div className="divide-y divide-border">{(view === 'tax' ? ['Tax setup'] : ['Fixed assets','Prepayments','Accruals','Deposits','Deferred revenue','Goods received not invoiced']).map(name=><div key={name} className="py-3 flex justify-between gap-3 text-sm"><span>{name}</span><span className="text-muted-foreground">Coming in part 3b</span></div>)}</div></section>
      ) : view === "ledger-audit" ? (
        <LedgerAuditLog />
      ) : view === "documents" ? (
        <DocumentCentre />
      ) : (
        <Ledger />
      )}
    </div>
  );
}
