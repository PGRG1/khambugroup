import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Ledger from "./Ledger";
import Journal from "./Journal";
import TrialBalance from "./TrialBalance";
import ChartOfAccounts from "./ChartOfAccounts";
import LedgerAuditLog from "./LedgerAuditLog";
import DocumentCentre from "./DocumentCentre";
const views = [
  ["ledger", "Ledger"],
  ["journal", "Journal"],
  ["trial-balance", "Trial balance"],
  ["chart-of-accounts", "Chart of accounts"],
  ["ledger-audit", "Audit"],
  ["documents", "Documents"],
];
export default function Books() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "ledger";
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {views.map(([key, label]) => (
          <Button
            key={key}
            variant="ghost"
            className={`rounded-none border-b-2 ${view === key ? "border-primary" : "border-transparent"}`}
            onClick={() => setParams({ view: key })}
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
