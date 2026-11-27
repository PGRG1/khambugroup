import { Navigate, useSearchParams } from "react-router-dom";
import Ledger from "./Ledger";
import Journal from "./Journal";
import TrialBalance from "./TrialBalance";
import LedgerAuditLog from "./LedgerAuditLog";
import DocumentCentre from "./DocumentCentre";
import { FinanceViewTabs } from '@/components/finance/FinanceViewTabs';
import './books.css';
const views = [
  ["journal", "Journal entries"],
  ["ledger", "Ledger"],
  ["trial-balance", "Trial balance"],
  ["documents", "Documents"],
  ["ledger-audit", "Audit"],
];
export default function Books() {
  const [params] = useSearchParams();
  const view = params.get("view") ?? "journal";
  // Chart of accounts, Schedules, Tax and Currency are settings: they live in Settings › Accounting.
  const moved: Record<string, string> = { "chart-of-accounts": "accounting&view=accounts", schedules: "accounting&view=schedule", tax: "accounting&view=tax", currencies: "accounting&view=base" };
  if (moved[view]) return <Navigate to={`/settings?tab=${moved[view]}`} replace />;
  return (
    <div className="books-page min-w-0 space-y-3">
      
      <FinanceViewTabs items={views.map(([key,label])=>({key,label}))} value={view} drop={["issue","entry"]}/>
      {view === "journal" ? (
        <Journal />
      ) : view === "trial-balance" ? (
        <TrialBalance />
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
