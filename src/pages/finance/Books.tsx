import {FinanceSchedulesView} from '@/components/finance/FinanceSchedulesView';
import {CurrenciesView} from '@/components/finance/CurrenciesView';
import {FinanceTaxView} from '@/components/finance/FinanceTaxView';
import { useSearchParams } from "react-router-dom";
import Ledger from "./Ledger";
import Journal from "./Journal";
import TrialBalance from "./TrialBalance";
import ChartOfAccounts from "./ChartOfAccounts";
import LedgerAuditLog from "./LedgerAuditLog";
import DocumentCentre from "./DocumentCentre";
import { FinanceViewTabs } from '@/components/finance/FinanceViewTabs';
import './books.css';
const views = [
  ["journal", "Journal"],
  ["ledger", "Ledger"],
  ["trial-balance", "Trial balance"],
  ["chart-of-accounts", "Accounts"],
  ["schedules", "Schedules"],
  ["tax", "Tax"],
  ["currencies", "Currencies"],
  ["documents", "Documents"],
  ["ledger-audit", "Audit"],
];
export default function Books() {
  const [params] = useSearchParams();
  const view = params.get("view") ?? "journal";
  return (
    <div className="books-page min-w-0 space-y-3">
      
      <FinanceViewTabs items={views.map(([key,label])=>({key,label}))} value={view} drop={["issue","entry"]}/>
      {view === "journal" ? (
        <Journal />
      ) : view === "trial-balance" ? (
        <TrialBalance />
      ) : view === "chart-of-accounts" ? (
        <ChartOfAccounts />
      ) : view === "schedules" ? (
        <FinanceSchedulesView/>
      ) : view === "tax" ? (
        <FinanceTaxView/>
      ) : view === "currencies" ? (
        <CurrenciesView/>
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
