import React, { Suspense } from "react";
import { lazyPage, prefetchPages } from "@/utils/lazyPage";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, useLocation, Routes, Route, Navigate, Outlet, useParams } from "react-router-dom";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { resolveAuthRoute } from "@/utils/authRouting";
import { readLastShell, writeLastShell } from "@/utils/lastShell";

import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { PreviewModeProvider, usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { AppLayout } from "@/components/AppLayout";
import { PlatformLayout } from "@/components/platform/PlatformLayout";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { PreviewBanner } from "@/components/access-control/PreviewBanner";
import { CrossTabTenantGuard } from "@/components/access-control/CrossTabTenantGuard";
const Index = lazyPage(() => import("./pages/Index"));
import Landing from "./pages/Landing";

const DataPage = lazyPage(() => import("./pages/DataPage"));
const SalesRecordDetail = lazyPage(() => import("./pages/SalesRecordDetail"));
const Settings = lazyPage(() => import("./pages/Settings"));

const ForecastInput = lazyPage(() => import("./pages/ForecastInput"));
const RevenueTargets = lazyPage(() => import("./pages/RevenueTargets"));
const RevenueTargetsNew = lazyPage(() => import("./pages/RevenueTargetsNew"));
const AuditLog = lazyPage(() => import("./pages/AuditLog"));
const PLReport = lazyPage(() => import("./pages/PLReport"));

const AiRules = lazyPage(() => import("./pages/admin/AiRules"));
const Clients = lazyPage(() => import("./pages/admin/Clients"));
const ClientDetail = lazyPage(() => import("./pages/admin/ClientDetail"));
const ClientOnboarding = lazyPage(() => import("./pages/admin/ClientOnboarding"));
const BusinessStructure = lazyPage(() => import("./pages/admin/BusinessStructure"));
const MasterData = lazyPage(() => import("./pages/admin/MasterData"));
const Preferences = lazyPage(() => import("./pages/admin/Preferences"));



import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
const UserAccessControl = lazyPage(() => import("./pages/UserAccessControl"));
const Reconciliation = lazyPage(() => import("./pages/revenue/Reconciliation"));
const RevenueAnalysis = lazyPage(() => import("./pages/revenue/Analysis"));
const RevenueSetup = lazyPage(() => import("./pages/revenue/RevenueSetup"));
import AccessDenied from "./pages/AccessDenied";

const Procurement = lazyPage(() => import("./pages/Procurement"));
const CreditNotes = lazyPage(() => import("./pages/procurement/CreditNotes"));
const StockCounts = lazyPage(() => import("./pages/procurement/StockCounts"));
const StockMenuOverview = lazyPage(() => import("./pages/procurement/StockMenuOverview"));
const StockMovementsTab = lazyPage(() => import("./components/procurement/StockMovementsTab"));
const SupplierAccountsPage = lazyPage(() => import("./pages/procurement/SupplierAccounts"));
const SupplierAccountPage = lazyPage(() => import("./pages/procurement/SupplierAccount"));
const OpeningBalances = lazyPage(() => import("./pages/procurement/OpeningBalances"));

const Cashflow = lazyPage(() => import("./pages/finance/Cashflow"));
const CashflowLedger = lazyPage(() => import("./pages/finance/CashflowLedger"));
const CashflowStatement = lazyPage(() => import("./pages/finance/CashflowStatement"));
const CashflowCombined = lazyPage(() => import("./pages/finance/CashflowCombined"));
const BalanceSheet = lazyPage(() => import("./pages/finance/BalanceSheet"));
const Ledger = lazyPage(() => import("./pages/finance/Ledger"));
const Journal = lazyPage(() => import("./pages/finance/Journal"));
const ChartOfAccounts = lazyPage(() => import("./pages/finance/ChartOfAccounts"));
const TrialBalance = lazyPage(() => import("./pages/finance/TrialBalance"));
const LedgerPL = lazyPage(() => import("./pages/finance/LedgerPL"));
const Receivables = lazyPage(() => import("./pages/finance/Receivables"));
const Payables = lazyPage(() => import("./pages/finance/Payables"));
const StaffReimbursements = lazyPage(() => import("./pages/finance/StaffReimbursements"));
const LedgerAuditLog = lazyPage(() => import("./pages/finance/LedgerAuditLog"));
const FinanceDashboard = lazyPage(() => import("./pages/finance/Dashboard"));
const FinanceReports = lazyPage(() => import("./pages/finance/Reports"));
const FinanceBooks = lazyPage(() => import("./pages/finance/Books"));
const CashBank = lazyPage(() => import("./pages/finance/CashBank"));
const MonthClose = lazyPage(() => import("./pages/finance/MonthClose"));


const DocumentCentre = lazyPage(() => import("./pages/finance/DocumentCentre"));
const DocumentsBills = lazyPage(() => import("./pages/finance/DocumentsBills"));
// Bills entry unified under /expenses/bills — the finance route below just redirects.
const PaymentsDashboardPage = lazyPage(() => import("./pages/payments/PaymentsDashboardPage"));
const PaymentsBatchesPage = lazyPage(() => import("./pages/payments/PaymentsBatchesPage"));
const PaymentsFeeAuditPage = lazyPage(() => import("./pages/payments/PaymentsFeeAuditPage"));
const PaymentsMonthlyPage = lazyPage(() => import("./pages/payments/PaymentsMonthlyPage"));
const PaymentsProcessorsPage = lazyPage(() => import("./pages/payments/PaymentsProcessorsPage"));
const PaymentsMerchantsPage = lazyPage(() => import("./pages/payments/PaymentsMerchantsPage"));
const PaymentsFeeRatesPage = lazyPage(() => import("./pages/payments/PaymentsFeeRatesPage"));
const PaymentsImportsPage = lazyPage(() => import("./pages/payments/PaymentsImportsPage"));
const PettyCashOverviewPage = lazyPage(() => import("./pages/petty-cash/PettyCashOverviewPage"));
const PettyCashReceiptsPage = lazyPage(() => import("./pages/petty-cash/PettyCashReceiptsPage"));
const PettyCashReplenishmentsPage = lazyPage(() => import("./pages/petty-cash/PettyCashReplenishmentsPage"));
const PettyCashFloatsPage = lazyPage(() => import("./pages/petty-cash/PettyCashFloatsPage"));
const PettyCashClassificationsPage = lazyPage(() => import("./pages/petty-cash/PettyCashClassificationsPage"));

const HREmployees = lazyPage(() => import("./pages/hr/HREmployees"));
const PeopleOverview = lazyPage(() => import("./pages/hr/PeopleOverview"));
const PeopleEntry = lazyPage(() => import("./pages/hr/PeopleOverview").then((m) => ({ default: m.PeopleEntry })));
const HREmployeeProfile = lazyPage(() => import("./pages/hr/HREmployeeProfile"));
const PeopleSettings = lazyPage(() => import("./pages/admin/PeopleSettings"));
const AccountingSettings = lazyPage(() => import("./pages/admin/Accounting"));
const CardProcessors = lazyPage(() => import("./pages/admin/CardProcessors"));
import { legacyFinanceDestination } from "@/utils/financeWorkingCapital";

const HRSchedule = lazyPage(() => import("./pages/hr/HRSchedule"));
const HRClock = lazyPage(() => import("./pages/hr/HRClock"));

const HRPayroll = lazyPage(() => import("./pages/hr/HRPayroll"));


const ExpenseBillsPage = lazyPage(() => import("./pages/expenses/ExpenseBills"));
const ExpensesOverview = lazyPage(() => import("./pages/expenses/ExpensesOverview"));

const RecurringExpensesPage = lazyPage(() => import("./pages/expenses/RecurringExpenses"));
const ExpenseCategoriesPage = lazyPage(() => import("./pages/expenses/Categories"));
const ExpenseMappingPage = lazyPage(() => import("./pages/expenses/Mapping"));
const ExpenseVendorAccountPage = lazyPage(() => import("./pages/expenses/VendorAccount"));


function ExpensesEntry(){const location=useLocation();return <Navigate to={{pathname:location.search?'/expenses/bills':'/expenses/overview',search:location.search}} state={location.state} replace/>;}
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

/** Plain screen in the page colour while access is checked (no text or layout that could flash). */
const QuietLoading = () => <div className="min-h-screen bg-background" role="status" aria-busy="true" aria-label="Loading" />;

/**
 * Empty client-portal frame (sage page, 52px top bar, sidebar column on desktop) shown while the
 * first access decision is made, but only when this browser last opened the client portal.
 * No data, links or names, so nothing in it can be wrong for the person signing in.
 */
const ShellFrame = () => {
  let sidebarOpen = true;
  try { sidebarOpen = localStorage.getItem("bani.sidebar.open") !== "0"; } catch { /* default open */ }
  return (
    <div className="tenant-portal min-h-screen flex w-full overflow-x-hidden" role="status" aria-busy="true" aria-label="Loading">
      <div className="hidden md:block shrink-0 bg-sidebar border-r border-sidebar-border" style={{ width: sidebarOpen ? "16rem" : "64px" }} />
      <main className="app-shell app-atmosphere app-bg-sage flex-1 min-w-0 flex flex-col">
        <header className="tenant-topbar sticky top-0 z-30 h-[52px] shrink-0 border-b border-border backdrop-blur" />
      </main>
    </div>
  );
};

/** Content area kept at full height, with nothing in it, while access is re-checked inside the frame. */
const QuietArea = () => <div className="min-h-[calc(100dvh-52px)]" role="status" aria-busy="true" aria-label="Loading" />;

/** One tenant shell; auth redirects never belong to individual pages. */
const TenantShell = () => {
  const { session, loading, roleLoading } = useAuth();
  const { isPlatformAdmin, loading: platLoading } = usePlatformAdmin();
  // Until the first access decision is made, show a plain screen instead of the client portal,
  // so platform admins (sent on to /platform/clients) never see the portal flash after signing in.
  // Once decided, the shell stays mounted through later reloads (tenant/preview switches).
  const decidedOnce = React.useRef(false);
  // Other screens download in the background once the portal is up, so moving around stays instant.
  React.useEffect(() => { if (session) prefetchPages(); }, [session]);
  const settled = !loading && !roleLoading && !platLoading;
  if (settled) {
    const decision = resolveAuthRoute({ session, isPlatformAdmin,
      enteredTenantId: localStorage.getItem("khambu.enteredTenantId") });
    if (decision.kind === "redirect") return <Navigate to={decision.to} replace />;
    decidedOnce.current = true;
    if (!isPlatformAdmin) writeLastShell("tenant");
  }
  // Returning client users see the empty portal frame instead of a blank screen; everyone else
  // (platform admins, first visits) keeps the plain screen so the portal never flashes for them.
  if (!decidedOnce.current) return readLastShell() === "tenant" ? <ShellFrame /> : <QuietLoading />;
  return <AppLayout>{loading || roleLoading || platLoading ? <QuietArea /> : <Suspense fallback={<QuietArea />}><Outlet /></Suspense>}</AppLayout>;
};

const ProtectedRoute = ({ children, pageKey }: { children: React.ReactNode; pageKey?: string }) => {
  const { isAdmin, user } = useAuth();
  const { previewUserId, isPreviewActive } = usePreviewMode();
  const effectiveUserId = isPreviewActive && isAdmin ? previewUserId : user?.id;
  const { canAccessPage, loading } = useUserPermissions(effectiveUserId || undefined);
  if (loading) return <QuietArea />;
  if (pageKey && (!isAdmin || isPreviewActive) && !canAccessPage(pageKey)) return <AccessDenied />;
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin } = useAuth();
  return isAdmin ? <>{children}</> : <AccessDenied />;
};

/** Authority-aware KPI gate: view_only < edit < admin. */



const PlatformRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  const { isPlatformAdmin, loading: platLoading } = usePlatformAdmin();
  if (loading || platLoading) return <QuietLoading />;
  if (!session) return <Navigate to="/auth" replace />;
  if (!isPlatformAdmin) return <Navigate to="/" replace />;
  writeLastShell("platform");
  return <PlatformLayout><Suspense fallback={<QuietArea />}>{children}</Suspense></PlatformLayout>;
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
              <BrowserRouter>
              <Toaster />
              <Sonner />
              <PreviewBanner />
              <CrossTabTenantGuard />
              <Suspense fallback={<QuietLoading />}>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/admin/clients" element={<Navigate to="/platform/clients" replace />} />
                <Route path="/admin/clients/:tenantId" element={<RedirectClientDetail />} />
                <Route path="/admin/clients/:tenantId/onboarding" element={<RedirectClientOnboarding />} />
                <Route path="/platform" element={<Navigate to="/platform/clients" replace />} />
                <Route path="/platform/clients" element={<PlatformRoute><Clients /></PlatformRoute>} />
                <Route path="/platform/clients/:tenantId" element={<PlatformRoute><ClientDetail /></PlatformRoute>} />
                <Route path="/platform/clients/:tenantId/onboarding" element={<PlatformRoute><ClientOnboarding /></PlatformRoute>} />
                <Route path="*" element={<NotFound />} />
                <Route element={<TenantShell />}>
<Route path="/" element={<ProtectedRoute><Landing /></ProtectedRoute>} />
                <Route path="/your-team" element={<Navigate to="/" replace />} />
                <Route path="/overview" element={<Navigate to="/" replace />} />
                <Route path="/revenue" element={<ProtectedRoute pageKey="revenue"><Index /></ProtectedRoute>} />
                <Route path="/sales-data" element={<ProtectedRoute pageKey="revenue"><DataPage /></ProtectedRoute>} />
                <Route path="/sales-data/:id" element={<ProtectedRoute pageKey="revenue"><SalesRecordDetail /></ProtectedRoute>} />
                <Route path="/revenue/reconciliation" element={<ProtectedRoute pageKey="revenue"><Reconciliation /></ProtectedRoute>} />
                <Route path="/revenue/analysis" element={<ProtectedRoute pageKey="revenue"><RevenueAnalysis /></ProtectedRoute>} />
                <Route path="/revenue/setup" element={<Navigate to="/settings?tab=business" replace />} />
                {/* Legacy routes consolidated into Revenue Setup / Sales Records */}
                <Route path="/revenue/service-periods" element={<Navigate to="/settings?tab=business" replace />} />
                <Route path="/revenue/mapping" element={<Navigate to="/settings?tab=business&section=accounts" replace />} />
                <Route path="/revenue/other" element={<Navigate to="/sales-data?view=other" replace />} />

                <Route path="/forecast/:venue" element={<ProtectedRoute pageKey="forecast"><RevenueTargets /></ProtectedRoute>} />
                <Route path="/revenue/targets-new" element={<ProtectedRoute pageKey="forecast"><RevenueTargetsNew /></ProtectedRoute>} />
                <Route path="/forecast-legacy/:venue" element={<ProtectedRoute pageKey="forecast"><ForecastInput /></ProtectedRoute>} />

                <Route path="/activity-log" element={<Navigate to="/settings?tab=users&view=activity" replace />} />
                <Route path="/pl-report" element={<ProtectedRoute pageKey="pl-report"><Navigate to="/finance/reports?view=pl" replace /></ProtectedRoute>} />
                <Route path="/finance" element={<AdminRoute><FinanceDashboard /></AdminRoute>} />
                <Route path="/finance/dashboard" element={<Navigate to="/finance" replace />} />
                <Route path="/finance/reports" element={<AdminRoute><FinanceReports /></AdminRoute>} />
                <Route path="/finance/books" element={<AdminRoute><FinanceBooks /></AdminRoute>} />
                <Route path="/finance/cash" element={<AdminRoute><CashBank /></AdminRoute>} />
                <Route path="/finance/close" element={<AdminRoute><MonthClose /></AdminRoute>} />
                {/* Cashflow: CashflowCombined at /finance/cashflow-report is canonical. Legacy paths redirect. */}
                <Route path="/finance/cashflow" element={<Navigate to="/finance/cashflow-report" replace />} />
                <Route path="/finance/cashflow-ledger" element={<Navigate to="/finance/reports?view=cash" replace />} />
                <Route path="/finance/cashflow-statement" element={<Navigate to="/finance/reports?view=cash" replace />} />
                <Route path="/finance/cashflow-report" element={<Navigate to="/finance/reports?view=cash" replace />} />
                <Route path="/finance/balance-sheet" element={<Navigate to="/finance/reports?view=bs" replace />} />
                <Route path="/finance/ledger" element={<Navigate to="/finance/books?view=ledger" replace />} />
                <Route path="/finance/journal" element={<Navigate to="/finance/books?view=journal" replace />} />
                <Route path="/finance/chart-of-accounts" element={<Navigate to="/finance/books?view=chart-of-accounts" replace />} />
                <Route path="/finance/trial-balance" element={<Navigate to="/finance/books?view=trial-balance" replace />} />
                <Route path="/finance/pl-ledger" element={<Navigate to="/finance/reports?view=pl" replace />} />
                <Route path="/finance/receivables" element={<AdminRoute><Receivables /></AdminRoute>} />
                <Route path="/staff-reimbursements" element={<Navigate to="/expenses/claims" replace />} />
                <Route path="/finance/payables" element={<AdminRoute><Payables /></AdminRoute>} />
                <Route path="/finance/ledger-audit" element={<Navigate to="/finance/books?view=ledger-audit" replace />} />
                
                <Route path="/finance/document-centre" element={<Navigate to="/finance/books?view=documents" replace />} />
                <Route path="/finance/documents-bills" element={<Navigate to="/procurement/invoices" replace />} />
                <Route path="/finance/bills-expenses" element={<Navigate to="/expenses" replace />} />
                <Route path="/payments" element={<AdminRoute><Navigate to={legacyFinanceDestination("/payments") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/payments/batches" element={<AdminRoute><Navigate to={legacyFinanceDestination("/payments/batches") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/payments/fee-audit" element={<AdminRoute><Navigate to={legacyFinanceDestination("/payments/fee-audit") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/payments/monthly" element={<AdminRoute><Navigate to={legacyFinanceDestination("/payments/monthly") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/payments/processors" element={<AdminRoute><Navigate to={legacyFinanceDestination("/payments/processors") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/payments/merchants" element={<AdminRoute><Navigate to={legacyFinanceDestination("/payments/merchants") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/payments/fee-rates" element={<AdminRoute><Navigate to={legacyFinanceDestination("/payments/fee-rates") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/payments/imports" element={<AdminRoute><Navigate to={legacyFinanceDestination("/payments/imports") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/petty-cash" element={<AdminRoute><Navigate to={legacyFinanceDestination("/petty-cash") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/petty-cash/receipts" element={<AdminRoute><Navigate to={legacyFinanceDestination("/petty-cash/receipts") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/petty-cash/replenishments" element={<AdminRoute><Navigate to={legacyFinanceDestination("/petty-cash/replenishments") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/petty-cash/floats" element={<AdminRoute><Navigate to={legacyFinanceDestination("/petty-cash/floats") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/petty-cash/classifications" element={<AdminRoute><Navigate to={legacyFinanceDestination("/petty-cash/classifications") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/admin/system-configuration" element={<Navigate to="/admin/structure" replace />} />
                <Route path="/admin/structure" element={<Navigate to="/settings?tab=business" replace />} />
                <Route path="/admin/master-data" element={<Navigate to="/settings?tab=business" replace />} />
                <Route path="/admin/people" element={<Navigate to="/settings?tab=users" replace />} />
                <Route path="/admin/accounting" element={<Navigate to="/settings?tab=accounting" replace />} />
                <Route path="/admin/accounting/card-processors" element={<Navigate to="/settings?tab=accounting&view=processors" replace />} />
                <Route path="/admin/preferences" element={<Navigate to="/settings" replace />} />
                <Route path="/admin/ai-rules" element={<Navigate to="/settings?tab=bani" replace />} />


                {/* Platform admin — hard-separated under /platform/*. Old /admin/clients* redirects. */}



                <Route path="/user-access" element={<Navigate to="/settings?tab=users" replace />} />
                
                <Route path="/procurement" element={<Navigate to="/procurement/dashboard" replace />} />
                <Route path="/procurement/dashboard" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="dashboard" /></ProtectedRoute>} />
                <Route path="/procurement/suppliers" element={<ProtectedRoute pageKey="invoices"><Navigate to="/settings?tab=master-data" replace /></ProtectedRoute>} />
                <Route path="/procurement/products" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="product-master" /></ProtectedRoute>} />
                <Route path="/procurement/categories" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="categories" /></ProtectedRoute>} />
                <Route path="/procurement/invoices" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="invoices" /></ProtectedRoute>} />
                <Route path="/procurement/purchase-orders" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="purchase-orders" /></ProtectedRoute>} />
                <Route path="/procurement/receiving" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="receiving" /></ProtectedRoute>} />
                <Route path="/procurement/line-items" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="line-items" /></ProtectedRoute>} />
                <Route path="/procurement/deposit-ledger" element={<ProtectedRoute pageKey="invoices"><Navigate to="/procurement/finance/suppliers" replace /></ProtectedRoute>} />
                <Route path="/procurement/stock-overview" element={<ProtectedRoute pageKey="invoices"><StockMenuOverview /></ProtectedRoute>} />
                <Route path="/procurement/inventory" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="inventory" /></ProtectedRoute>} />
                <Route path="/procurement/menu-costing" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="menu-costing" /></ProtectedRoute>} />
                <Route path="/procurement/documents" element={<Navigate to="/procurement/invoices" replace />} />
                <Route path="/procurement/credit-notes" element={<AdminRoute><CreditNotes /></AdminRoute>} />
                <Route path="/procurement/stock-counts" element={<ProtectedRoute pageKey="invoices"><StockCounts /></ProtectedRoute>} />
                <Route path="/procurement/movements" element={<AdminRoute><StockMovementsTab /></AdminRoute>} />
                <Route path="/procurement/transfers" element={<AdminRoute><Navigate to="/procurement/movements?type=transfer" replace /></AdminRoute>} />
                <Route path="/procurement/waste" element={<AdminRoute><Navigate to="/procurement/movements?type=waste" replace /></AdminRoute>} />

                <Route path="/procurement/finance" element={<Navigate to="/procurement/finance/spend" replace />} />
                <Route path="/procurement/finance/spend" element={<ProtectedRoute pageKey="invoices"><Navigate to="/procurement/dashboard" replace /></ProtectedRoute>} />
                <Route path="/procurement/finance/suppliers" element={<ProtectedRoute pageKey="invoices"><SupplierAccountsPage /></ProtectedRoute>} />
                <Route path="/procurement/finance/payables" element={<ProtectedRoute pageKey="invoices"><Navigate to="/procurement/finance/suppliers?view=invoice" replace /></ProtectedRoute>} />
                <Route path="/procurement/finance/onboarding" element={<Navigate to="/settings?tab=accounting&view=opening" replace />} />
                <Route path="/procurement/finance/suppliers/:supplierId" element={<ProtectedRoute pageKey="invoices"><SupplierAccountPage /></ProtectedRoute>} />

                <Route path="/procurement/purchase-analysis" element={<Navigate to="/procurement/dashboard" replace />} />
                <Route path="/procurement/supplier-pricing" element={<Navigate to="/procurement/dashboard" replace />} />

                <Route path="/bank" element={<AdminRoute><Navigate to={legacyFinanceDestination("/bank") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/bank/dashboard" element={<AdminRoute><Navigate to={legacyFinanceDestination("/bank/dashboard") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/bank/accounts" element={<AdminRoute><Navigate to={legacyFinanceDestination("/bank/accounts") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/bank/transactions" element={<AdminRoute><Navigate to={legacyFinanceDestination("/bank/transactions") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/bank/reconciliation" element={<AdminRoute><Navigate to={legacyFinanceDestination("/bank/reconciliation") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/bank/incoming" element={<AdminRoute><Navigate to={legacyFinanceDestination("/bank/incoming") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/bank/outgoing" element={<AdminRoute><Navigate to={legacyFinanceDestination("/bank/outgoing") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/bank/matching" element={<AdminRoute><Navigate to={legacyFinanceDestination("/bank/matching") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/bank/transfers" element={<AdminRoute><Navigate to={legacyFinanceDestination("/bank/transfers") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/bank/fx" element={<AdminRoute><Navigate to={legacyFinanceDestination("/bank/fx") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/bank/rules" element={<AdminRoute><Navigate to={legacyFinanceDestination("/bank/rules") ?? "/finance/cash"} replace /></AdminRoute>} />
                <Route path="/bank/fees" element={<AdminRoute><Navigate to={legacyFinanceDestination("/bank/fees") ?? "/finance/cash"} replace /></AdminRoute>} />
                

                

                
                <Route path="/hr" element={<ProtectedRoute pageKey="people"><PeopleEntry /></ProtectedRoute>} />
                <Route path="/hr/overview" element={<ProtectedRoute pageKey="people"><PeopleOverview /></ProtectedRoute>} />
                <Route path="/hr/employees" element={<AdminRoute><HREmployees /></AdminRoute>} />
                <Route path="/hr/employees/:id" element={<AdminRoute><HREmployeeProfile /></AdminRoute>} />
                
                <Route path="/hr/schedule" element={<ProtectedRoute pageKey="people"><HRSchedule /></ProtectedRoute>} />
                <Route path="/hr/clock" element={<ProtectedRoute><HRClock /></ProtectedRoute>} />
                <Route path="/hr/leave" element={<Navigate to="/hr/schedule" replace />} />
                <Route path="/hr/payroll" element={<ProtectedRoute pageKey="people"><HRPayroll /></ProtectedRoute>} />
                <Route path="/hr/payroll/payables" element={<Navigate to="/finance/payables" replace />} />


                <Route path="/expenses" element={<ExpensesEntry />} />
                <Route path="/expenses/overview" element={<AdminRoute><ExpensesOverview /></AdminRoute>} />
                <Route path="/expenses/bills" element={<AdminRoute><ExpenseBillsPage /></AdminRoute>} />
                <Route path="/expenses/claims" element={<AdminRoute><StaffReimbursements /></AdminRoute>} />
                
                <Route path="/expenses/bank-detected" element={<Navigate to="/finance/payables" replace />} />
                <Route path="/expenses/recurring" element={<AdminRoute><RecurringExpensesPage /></AdminRoute>} />
                <Route path="/expenses/categories" element={<Navigate to="/settings?tab=accounting&view=categories" replace />} />
                <Route path="/expenses/vendors" element={<Navigate to="/settings?tab=master-data" replace />} />
                <Route path="/expenses/mapping" element={<Navigate to="/settings?tab=accounting&view=categories" replace />} />
                
                <Route path="/expenses/approvals" element={<Navigate to="/expenses?status=waiting" replace />} />
                <Route path="/expenses/analytics" element={<Navigate to="/expenses/overview" replace />} />
                <Route path="/expenses/finance" element={<Navigate to="/expenses/finance/spend" replace />} />
                <Route path="/expenses/finance/spend" element={<Navigate to="/expenses/analytics" replace />} />
                <Route path="/expenses/finance/vendors" element={<Navigate to="/finance/payables" replace />} />
                <Route path="/expenses/finance/vendors/:vendorId" element={<AdminRoute><ExpenseVendorAccountPage /></AdminRoute>} />
                <Route path="/expenses/finance/payables" element={<Navigate to="/finance/payables" replace />} />
                <Route path="/assistant" element={<Navigate to="/" replace />} />
                <Route path="/finance-team" element={<Navigate to="/" replace />} />
                <Route path="/kpis/*" element={<Navigate to="/" replace />} />
                <Route path="/kpis" element={<Navigate to="/" replace />} />
                <Route path="/notifications" element={<Navigate to="/?bani_event=summary" replace />} />





                </Route>
              </Routes>
              </Suspense>
            </BrowserRouter>
            </PreviewModeProvider>
          </ThemeProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
