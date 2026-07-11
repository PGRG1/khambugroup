import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";

import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { PreviewModeProvider, usePreviewMode } from "@/hooks/usePreviewMode";
import { TenantPreviewProvider } from "@/contexts/TenantPreviewContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { AppLayout } from "@/components/AppLayout";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { PreviewBanner } from "@/components/access-control/PreviewBanner";
import { TenantPreviewBanner } from "@/components/access-control/TenantPreviewBanner";
import Assistant from "./pages/Assistant";
import Index from "./pages/Index";
import Home from "./pages/Home";

import DataPage from "./pages/DataPage";
import SalesRecordDetail from "./pages/SalesRecordDetail";
import Notifications from "./pages/Notifications";
import MyKpis from "./pages/kpis/MyKpis";
import KpiAssignmentBoard from "./pages/kpis/KpiAssignmentBoard";
import KpiTargets from "./pages/kpis/KpiTargets";
import KpiPlanner from "./pages/kpis/KpiPlanner";

import ForecastInput from "./pages/ForecastInput";
import RevenueTargets from "./pages/RevenueTargets";
import AuditLog from "./pages/AuditLog";
import PLReport from "./pages/PLReport";

import AiRules from "./pages/admin/AiRules";
import Clients from "./pages/admin/Clients";
import ClientDetail from "./pages/admin/ClientDetail";
import ClientOnboarding from "./pages/admin/ClientOnboarding";
import BusinessStructure from "./pages/admin/BusinessStructure";
import MasterData from "./pages/admin/MasterData";
import Preferences from "./pages/admin/Preferences";


import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import UserAccessControl from "./pages/UserAccessControl";
import Reconciliation from "./pages/revenue/Reconciliation";
import ServicePeriods from "./pages/revenue/ServicePeriods";
import AccessDenied from "./pages/AccessDenied";

import Procurement from "./pages/Procurement";
import CreditNotes from "./pages/procurement/CreditNotes";
import StockCounts from "./pages/procurement/StockCounts";
import Transfers from "./pages/procurement/Transfers";
import SpendSummaryPage from "./pages/procurement/SpendSummary";
import SupplierAccountsPage from "./pages/procurement/SupplierAccounts";
import OpenPayablesPage from "./pages/procurement/OpenPayables";
import SupplierAccountPage from "./pages/procurement/SupplierAccount";
import PurchaseAnalysis from "./pages/procurement/PurchaseAnalysis";
import SupplierPricing from "./pages/procurement/SupplierPricing";
import OpeningBalances from "./pages/procurement/OpeningBalances";
import WastePage from "./pages/procurement/Waste";

import Cashflow from "./pages/finance/Cashflow";
import CashflowLedger from "./pages/finance/CashflowLedger";
import CashflowStatement from "./pages/finance/CashflowStatement";
import CashflowCombined from "./pages/finance/CashflowCombined";
import BalanceSheet from "./pages/finance/BalanceSheet";
import Ledger from "./pages/finance/Ledger";
import Journal from "./pages/finance/Journal";
import ChartOfAccounts from "./pages/finance/ChartOfAccounts";
import TrialBalance from "./pages/finance/TrialBalance";
import LedgerPL from "./pages/finance/LedgerPL";
import Receivables from "./pages/finance/Receivables";
import Payables from "./pages/finance/Payables";
import LedgerAuditLog from "./pages/finance/LedgerAuditLog";
import FinanceDashboard from "./pages/finance/Dashboard";

import BankDashboard from "./pages/bank/BankDashboard";
import BankAccountsPage from "./pages/bank/BankAccountsPage";
import BankTransactionsPage from "./pages/bank/BankTransactionsPage";
import BankReconciliationPage from "./pages/bank/BankReconciliationPage";
import IncomingDepositsPage from "./pages/bank/IncomingDepositsPage";
import OutgoingPaymentsPage from "./pages/bank/OutgoingPaymentsPage";
import PaymentMatchingPage from "./pages/bank/PaymentMatchingPage";
import TransfersPage from "./pages/bank/TransfersPage";
import FxMultiCurrencyPage from "./pages/bank/FxMultiCurrencyPage";
import BankRulesPage from "./pages/bank/BankRulesPage";
import BankFeesPage from "./pages/bank/BankFeesPage";

import DocumentCentre from "./pages/finance/DocumentCentre";
import DocumentsBills from "./pages/finance/DocumentsBills";
// Bills entry unified under /expenses/bills — the finance route below just redirects.
import PaymentsDashboardPage from "./pages/payments/PaymentsDashboardPage";
import PaymentsBatchesPage from "./pages/payments/PaymentsBatchesPage";
import PaymentsFeeAuditPage from "./pages/payments/PaymentsFeeAuditPage";
import PaymentsMonthlyPage from "./pages/payments/PaymentsMonthlyPage";
import PaymentsProcessorsPage from "./pages/payments/PaymentsProcessorsPage";
import PaymentsMerchantsPage from "./pages/payments/PaymentsMerchantsPage";
import PaymentsFeeRatesPage from "./pages/payments/PaymentsFeeRatesPage";
import PaymentsImportsPage from "./pages/payments/PaymentsImportsPage";
import PettyCashOverviewPage from "./pages/petty-cash/PettyCashOverviewPage";
import PettyCashReceiptsPage from "./pages/petty-cash/PettyCashReceiptsPage";
import PettyCashReplenishmentsPage from "./pages/petty-cash/PettyCashReplenishmentsPage";
import PettyCashFloatsPage from "./pages/petty-cash/PettyCashFloatsPage";
import PettyCashClassificationsPage from "./pages/petty-cash/PettyCashClassificationsPage";

import HREmployees from "./pages/hr/HREmployees";
import HREmployeeProfile from "./pages/hr/HREmployeeProfile";
import HRDashboard from "./pages/hr/HRDashboard";
import HROrgChart from "./pages/hr/HROrgChart";
import HRSchedule from "./pages/hr/HRSchedule";
import HRLeave from "./pages/hr/HRLeave";
import HRPayroll from "./pages/hr/HRPayroll";

import ExpensesOverview from "./pages/expenses/Overview";
import ExpenseBillsPage from "./pages/expenses/ExpenseBills";
import VendorStatementsPage from "./pages/expenses/VendorStatements";
import BankDetectedExpensesPage from "./pages/expenses/BankDetectedExpenses";
import RecurringExpensesPage from "./pages/expenses/RecurringExpenses";
import ExpenseCategoriesPage from "./pages/expenses/Categories";
import ExpenseVendorsPage from "./pages/expenses/ExpenseVendors";
import ExpensePaymentTermsPage from "./pages/expenses/ExpensePaymentTerms";
import ExpenseApprovalsPage from "./pages/expenses/Approvals";
import ExpenseAnalyticsPage from "./pages/expenses/Analytics";

const queryClient = new QueryClient();

const pageKeyMap: Record<string, string> = {
  "/": "revenue",
  
  "/forecast": "forecast",
  "/activity-log": "activity-log",
  "/pl-report": "pl-report",
  "/procurement": "invoices",
  "/inventory": "inventory",
  "/assistant": "assistant",
};

const ProtectedRoute = ({ children, pageKey }: { children: React.ReactNode; pageKey?: string }) => {
  const { session, loading, isAdmin, user } = useAuth();
  const { previewUserId, isPreviewActive } = usePreviewMode();
  const effectiveUserId = isPreviewActive && isAdmin ? previewUserId : user?.id;
  const { canAccessPage, loading: permLoading } = useUserPermissions(effectiveUserId || undefined);

  if (loading || permLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  if (!session) return <Navigate to="/auth" replace />;
  
  // Check page access (admins bypass unless previewing)
  if (pageKey && !isAdmin && !canAccessPage(pageKey)) {
    return <AppLayout><AccessDenied /></AppLayout>;
  }
  if (pageKey && isPreviewActive && isAdmin && !canAccessPage(pageKey)) {
    return <AppLayout><AccessDenied /></AppLayout>;
  }

  return <AppLayout>{children}</AppLayout>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading, isAdmin } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  if (!session) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
};

const PlatformRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  const { isPlatformAdmin, loading: platLoading } = usePlatformAdmin();
  if (loading || platLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  if (!session) return <Navigate to="/auth" replace />;
  if (!isPlatformAdmin) return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
};

// Legacy /admin/clients* → /platform/clients* redirects (preserves :tenantId).
const RedirectClientDetail = () => {
  const { tenantId } = useParams();
  return <Navigate to={`/platform/clients/${tenantId}`} replace />;
};
const RedirectClientOnboarding = () => {
  const { tenantId } = useParams();
  return <Navigate to={`/platform/clients/${tenantId}/onboarding`} replace />;
};


function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <ThemeProvider>
            <PreviewModeProvider>
              <Toaster />
              <Sonner />
              <PreviewBanner />
              <BrowserRouter>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                <Route path="/revenue" element={<ProtectedRoute pageKey="revenue"><Index /></ProtectedRoute>} />
                <Route path="/sales-data" element={<ProtectedRoute pageKey="revenue"><DataPage /></ProtectedRoute>} />
                <Route path="/sales-data/:id" element={<ProtectedRoute pageKey="revenue"><SalesRecordDetail /></ProtectedRoute>} />
                <Route path="/revenue/reconciliation" element={<ProtectedRoute pageKey="revenue"><Reconciliation /></ProtectedRoute>} />
                <Route path="/revenue/service-periods" element={<ProtectedRoute pageKey="revenue"><ServicePeriods /></ProtectedRoute>} />

                <Route path="/forecast/:venue" element={<ProtectedRoute pageKey="forecast"><RevenueTargets /></ProtectedRoute>} />
                <Route path="/forecast-legacy/:venue" element={<ProtectedRoute pageKey="forecast"><ForecastInput /></ProtectedRoute>} />

                <Route path="/activity-log" element={<ProtectedRoute pageKey="activity-log"><AuditLog /></ProtectedRoute>} />
                <Route path="/pl-report" element={<ProtectedRoute pageKey="pl-report"><PLReport /></ProtectedRoute>} />
                <Route path="/finance" element={<AdminRoute><FinanceDashboard /></AdminRoute>} />
                <Route path="/finance/dashboard" element={<AdminRoute><FinanceDashboard /></AdminRoute>} />
                {/* Cashflow: CashflowCombined at /finance/cashflow-report is canonical. Legacy paths redirect. */}
                <Route path="/finance/cashflow" element={<Navigate to="/finance/cashflow-report" replace />} />
                <Route path="/finance/cashflow-ledger" element={<Navigate to="/finance/cashflow-report?view=ledger" replace />} />
                <Route path="/finance/cashflow-statement" element={<Navigate to="/finance/cashflow-report?view=statement" replace />} />
                <Route path="/finance/cashflow-report" element={<AdminRoute><CashflowCombined /></AdminRoute>} />
                <Route path="/finance/balance-sheet" element={<AdminRoute><BalanceSheet /></AdminRoute>} />
                <Route path="/finance/ledger" element={<AdminRoute><Ledger /></AdminRoute>} />
                <Route path="/finance/journal" element={<AdminRoute><Journal /></AdminRoute>} />
                <Route path="/finance/chart-of-accounts" element={<AdminRoute><ChartOfAccounts /></AdminRoute>} />
                <Route path="/finance/trial-balance" element={<AdminRoute><TrialBalance /></AdminRoute>} />
                <Route path="/finance/pl-ledger" element={<AdminRoute><LedgerPL /></AdminRoute>} />
                <Route path="/finance/receivables" element={<AdminRoute><Receivables /></AdminRoute>} />
                <Route path="/finance/payables" element={<AdminRoute><Payables /></AdminRoute>} />
                <Route path="/finance/ledger-audit" element={<AdminRoute><LedgerAuditLog /></AdminRoute>} />
                
                <Route path="/finance/document-centre" element={<AdminRoute><DocumentCentre /></AdminRoute>} />
                <Route path="/finance/documents-bills" element={<AdminRoute><DocumentsBills /></AdminRoute>} />
                <Route path="/finance/bills-expenses" element={<Navigate to="/expenses/bills" replace />} />
                <Route path="/payments" element={<AdminRoute><PaymentsDashboardPage /></AdminRoute>} />
                <Route path="/payments/batches" element={<AdminRoute><PaymentsBatchesPage /></AdminRoute>} />
                <Route path="/payments/fee-audit" element={<AdminRoute><PaymentsFeeAuditPage /></AdminRoute>} />
                <Route path="/payments/monthly" element={<AdminRoute><PaymentsMonthlyPage /></AdminRoute>} />
                <Route path="/payments/processors" element={<AdminRoute><PaymentsProcessorsPage /></AdminRoute>} />
                <Route path="/payments/merchants" element={<AdminRoute><PaymentsMerchantsPage /></AdminRoute>} />
                <Route path="/payments/fee-rates" element={<AdminRoute><PaymentsFeeRatesPage /></AdminRoute>} />
                <Route path="/payments/imports" element={<AdminRoute><PaymentsImportsPage /></AdminRoute>} />
                <Route path="/petty-cash" element={<AdminRoute><PettyCashOverviewPage /></AdminRoute>} />
                <Route path="/petty-cash/receipts" element={<AdminRoute><PettyCashReceiptsPage /></AdminRoute>} />
                <Route path="/petty-cash/replenishments" element={<AdminRoute><PettyCashReplenishmentsPage /></AdminRoute>} />
                <Route path="/petty-cash/floats" element={<AdminRoute><PettyCashFloatsPage /></AdminRoute>} />
                <Route path="/petty-cash/classifications" element={<AdminRoute><PettyCashClassificationsPage /></AdminRoute>} />
                <Route path="/settings" element={<Navigate to="/admin/preferences" replace />} />
                <Route path="/admin/system-configuration" element={<Navigate to="/admin/structure" replace />} />
                <Route path="/admin/structure" element={<AdminRoute><BusinessStructure /></AdminRoute>} />
                <Route path="/admin/master-data" element={<AdminRoute><MasterData /></AdminRoute>} />
                <Route path="/admin/preferences" element={<AdminRoute><Preferences /></AdminRoute>} />
                <Route path="/admin/ai-rules" element={<AdminRoute><AiRules /></AdminRoute>} />

                {/* Platform admin — hard-separated under /platform/*. Old /admin/clients* redirects. */}
                <Route path="/admin/clients" element={<Navigate to="/platform/clients" replace />} />
                <Route path="/admin/clients/:tenantId" element={<RedirectClientDetail />} />
                <Route path="/admin/clients/:tenantId/onboarding" element={<RedirectClientOnboarding />} />
                <Route path="/platform" element={<Navigate to="/platform/clients" replace />} />
                <Route path="/platform/clients" element={<PlatformRoute><Clients /></PlatformRoute>} />
                <Route path="/platform/clients/:tenantId" element={<PlatformRoute><ClientDetail /></PlatformRoute>} />
                <Route path="/platform/clients/:tenantId/onboarding" element={<PlatformRoute><ClientOnboarding /></PlatformRoute>} />



                <Route path="/user-access" element={<AdminRoute><UserAccessControl /></AdminRoute>} />
                
                <Route path="/procurement" element={<Navigate to="/procurement/dashboard" replace />} />
                <Route path="/procurement/dashboard" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="dashboard" /></ProtectedRoute>} />
                <Route path="/procurement/suppliers" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="suppliers" /></ProtectedRoute>} />
                <Route path="/procurement/products" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="product-master" /></ProtectedRoute>} />
                <Route path="/procurement/categories" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="categories" /></ProtectedRoute>} />
                <Route path="/procurement/invoices" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="invoices" /></ProtectedRoute>} />
                <Route path="/procurement/purchase-orders" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="purchase-orders" /></ProtectedRoute>} />
                <Route path="/procurement/receiving" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="receiving" /></ProtectedRoute>} />
                <Route path="/procurement/line-items" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="line-items" /></ProtectedRoute>} />
                <Route path="/procurement/deposit-ledger" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="deposit-ledger" /></ProtectedRoute>} />
                <Route path="/procurement/inventory" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="inventory" /></ProtectedRoute>} />
                <Route path="/procurement/menu-costing" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="menu-costing" /></ProtectedRoute>} />
                <Route path="/procurement/documents" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="documents" /></ProtectedRoute>} />
                <Route path="/procurement/credit-notes" element={<AdminRoute><CreditNotes /></AdminRoute>} />
                <Route path="/procurement/stock-counts" element={<AdminRoute><StockCounts /></AdminRoute>} />
                <Route path="/procurement/transfers" element={<AdminRoute><Transfers /></AdminRoute>} />
                <Route path="/procurement/waste" element={<AdminRoute><WastePage /></AdminRoute>} />

                <Route path="/procurement/finance" element={<Navigate to="/procurement/finance/spend" replace />} />
                <Route path="/procurement/finance/spend" element={<ProtectedRoute pageKey="invoices"><SpendSummaryPage /></ProtectedRoute>} />
                <Route path="/procurement/finance/suppliers" element={<ProtectedRoute pageKey="invoices"><SupplierAccountsPage /></ProtectedRoute>} />
                <Route path="/procurement/finance/payables" element={<ProtectedRoute pageKey="invoices"><OpenPayablesPage /></ProtectedRoute>} />
                <Route path="/procurement/finance/onboarding" element={<ProtectedRoute pageKey="invoices"><OpeningBalances /></ProtectedRoute>} />
                <Route path="/procurement/finance/suppliers/:supplierId" element={<ProtectedRoute pageKey="invoices"><SupplierAccountPage /></ProtectedRoute>} />

                <Route path="/procurement/purchase-analysis" element={<AdminRoute><PurchaseAnalysis /></AdminRoute>} />
                <Route path="/procurement/supplier-pricing" element={<AdminRoute><SupplierPricing /></AdminRoute>} />

                <Route path="/bank" element={<Navigate to="/bank/dashboard" replace />} />
                <Route path="/bank/dashboard" element={<AdminRoute><BankDashboard /></AdminRoute>} />
                <Route path="/bank/accounts" element={<AdminRoute><BankAccountsPage /></AdminRoute>} />
                <Route path="/bank/transactions" element={<AdminRoute><BankTransactionsPage /></AdminRoute>} />
                <Route path="/bank/reconciliation" element={<AdminRoute><BankReconciliationPage /></AdminRoute>} />
                <Route path="/bank/incoming" element={<AdminRoute><IncomingDepositsPage /></AdminRoute>} />
                <Route path="/bank/outgoing" element={<AdminRoute><OutgoingPaymentsPage /></AdminRoute>} />
                <Route path="/bank/matching" element={<AdminRoute><PaymentMatchingPage /></AdminRoute>} />
                <Route path="/bank/transfers" element={<AdminRoute><TransfersPage /></AdminRoute>} />
                <Route path="/bank/fx" element={<AdminRoute><FxMultiCurrencyPage /></AdminRoute>} />
                <Route path="/bank/rules" element={<AdminRoute><BankRulesPage /></AdminRoute>} />
                <Route path="/bank/fees" element={<AdminRoute><BankFeesPage /></AdminRoute>} />
                

                

                
                <Route path="/hr" element={<AdminRoute><HRDashboard /></AdminRoute>} />
                <Route path="/hr/employees" element={<AdminRoute><HREmployees /></AdminRoute>} />
                <Route path="/hr/employees/:id" element={<AdminRoute><HREmployeeProfile /></AdminRoute>} />
                <Route path="/hr/org-chart" element={<AdminRoute><HROrgChart /></AdminRoute>} />
                <Route path="/hr/schedule" element={<AdminRoute><HRSchedule /></AdminRoute>} />
                <Route path="/hr/leave" element={<AdminRoute><HRLeave /></AdminRoute>} />
                <Route path="/hr/payroll" element={<AdminRoute><HRPayroll /></AdminRoute>} />


                <Route path="/expenses" element={<AdminRoute><ExpensesOverview /></AdminRoute>} />
                <Route path="/expenses/bills" element={<AdminRoute><ExpenseBillsPage /></AdminRoute>} />
                <Route path="/expenses/statements" element={<AdminRoute><VendorStatementsPage /></AdminRoute>} />
                <Route path="/expenses/bank-detected" element={<AdminRoute><BankDetectedExpensesPage /></AdminRoute>} />
                <Route path="/expenses/recurring" element={<AdminRoute><RecurringExpensesPage /></AdminRoute>} />
                <Route path="/expenses/categories" element={<AdminRoute><ExpenseCategoriesPage /></AdminRoute>} />
                <Route path="/expenses/vendors" element={<AdminRoute><ExpenseVendorsPage /></AdminRoute>} />
                <Route path="/expenses/payment-terms" element={<AdminRoute><ExpensePaymentTermsPage /></AdminRoute>} />
                <Route path="/expenses/approvals" element={<AdminRoute><ExpenseApprovalsPage /></AdminRoute>} />
                <Route path="/expenses/analytics" element={<AdminRoute><ExpenseAnalyticsPage /></AdminRoute>} />
                <Route path="/assistant" element={<ProtectedRoute pageKey="assistant"><Assistant /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute pageKey="notifications"><Notifications /></ProtectedRoute>} />
                <Route path="/kpis/my-cards" element={<ProtectedRoute pageKey="kpis"><MyKpis /></ProtectedRoute>} />
                <Route path="/kpis/assignments" element={<AdminRoute><KpiAssignmentBoard /></AdminRoute>} />
                <Route path="/kpis/targets" element={<AdminRoute><KpiTargets /></AdminRoute>} />
                <Route path="/kpis/planner" element={<AdminRoute><KpiPlanner /></AdminRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
            </PreviewModeProvider>
          </ThemeProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
