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
  ["chart-of-accounts", "Chart of accounts"],
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
