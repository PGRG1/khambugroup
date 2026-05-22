import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { PreviewModeProvider, usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { AppLayout } from "@/components/AppLayout";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { PreviewBanner } from "@/components/access-control/PreviewBanner";
import Assistant from "./pages/Assistant";
import Index from "./pages/Index";
import DataPage from "./pages/DataPage";

import ForecastInput from "./pages/ForecastInput";
import AuditLog from "./pages/AuditLog";
import PLReport from "./pages/PLReport";
import Settings from "./pages/Settings";
import SystemConfiguration from "./pages/admin/SystemConfiguration";
import AiRules from "./pages/admin/AiRules";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import UserAccessControl from "./pages/UserAccessControl";
import AccessDenied from "./pages/AccessDenied";

import Procurement from "./pages/Procurement";
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
import BankReconciliation from "./pages/finance/BankReconciliation";
import DocumentCentre from "./pages/finance/DocumentCentre";
import DocumentsBills from "./pages/finance/DocumentsBills";
import PaymentsSettlements from "./pages/finance/PaymentsSettlements";

import HREmployees from "./pages/hr/HREmployees";
import HROrgChart from "./pages/hr/HROrgChart";
import HRSchedule from "./pages/hr/HRSchedule";
import HRLeave from "./pages/hr/HRLeave";
import HRPayroll from "./pages/hr/HRPayroll";

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
                <Route path="/" element={<ProtectedRoute pageKey="revenue"><Index /></ProtectedRoute>} />
                <Route path="/sales-data" element={<ProtectedRoute pageKey="revenue"><DataPage /></ProtectedRoute>} />
                
                <Route path="/forecast/:venue" element={<ProtectedRoute pageKey="forecast"><ForecastInput /></ProtectedRoute>} />
                <Route path="/activity-log" element={<ProtectedRoute pageKey="activity-log"><AuditLog /></ProtectedRoute>} />
                <Route path="/pl-report" element={<ProtectedRoute pageKey="pl-report"><PLReport /></ProtectedRoute>} />
                <Route path="/finance" element={<AdminRoute><FinanceDashboard /></AdminRoute>} />
                <Route path="/finance/dashboard" element={<AdminRoute><FinanceDashboard /></AdminRoute>} />
                <Route path="/finance/cashflow" element={<AdminRoute><Cashflow /></AdminRoute>} />
                <Route path="/finance/cashflow-ledger" element={<AdminRoute><CashflowLedger /></AdminRoute>} />
                <Route path="/finance/cashflow-statement" element={<AdminRoute><CashflowStatement /></AdminRoute>} />
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
                <Route path="/finance/bank-reconciliation" element={<AdminRoute><BankReconciliation /></AdminRoute>} />
                <Route path="/finance/document-centre" element={<AdminRoute><DocumentCentre /></AdminRoute>} />
                <Route path="/finance/documents-bills" element={<AdminRoute><DocumentsBills /></AdminRoute>} />
                <Route path="/finance/payments-settlements" element={<AdminRoute><PaymentsSettlements /></AdminRoute>} />
                <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
                <Route path="/admin/system-configuration" element={<AdminRoute><SystemConfiguration /></AdminRoute>} />
                <Route path="/admin/ai-rules" element={<AdminRoute><AiRules /></AdminRoute>} />
                <Route path="/user-access" element={<AdminRoute><UserAccessControl /></AdminRoute>} />
                
                <Route path="/procurement" element={<Navigate to="/procurement/dashboard" replace />} />
                <Route path="/procurement/dashboard" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="dashboard" /></ProtectedRoute>} />
                <Route path="/procurement/suppliers" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="suppliers" /></ProtectedRoute>} />
                <Route path="/procurement/products" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="product-master" /></ProtectedRoute>} />
                <Route path="/procurement/categories" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="categories" /></ProtectedRoute>} />
                <Route path="/procurement/invoices" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="invoices" /></ProtectedRoute>} />
                <Route path="/procurement/line-items" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="line-items" /></ProtectedRoute>} />
                <Route path="/procurement/inventory" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="inventory" /></ProtectedRoute>} />
                <Route path="/procurement/menu-costing" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="menu-costing" /></ProtectedRoute>} />
                <Route path="/procurement/documents" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="documents" /></ProtectedRoute>} />
                
                <Route path="/hr" element={<Navigate to="/hr/employees" replace />} />
                <Route path="/hr/employees" element={<AdminRoute><HREmployees /></AdminRoute>} />
                <Route path="/hr/org-chart" element={<AdminRoute><HROrgChart /></AdminRoute>} />
                <Route path="/hr/schedule" element={<AdminRoute><HRSchedule /></AdminRoute>} />
                <Route path="/hr/leave" element={<AdminRoute><HRLeave /></AdminRoute>} />
                <Route path="/hr/payroll" element={<AdminRoute><HRPayroll /></AdminRoute>} />
                <Route path="/assistant" element={<ProtectedRoute pageKey="assistant"><Assistant /></ProtectedRoute>} />
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
