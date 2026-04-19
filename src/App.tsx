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
import { PreviewBanner } from "@/components/access-control/PreviewBanner";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import Index from "./pages/Index";

import ForecastInput from "./pages/ForecastInput";
import AuditLog from "./pages/AuditLog";
import PLReport from "./pages/PLReport";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import UserAccessControl from "./pages/UserAccessControl";
import AccessDenied from "./pages/AccessDenied";
import Invoices from "./pages/Invoices";
import Procurement from "./pages/Procurement";

import HREmployees from "./pages/hr/HREmployees";
import HRSchedule from "./pages/hr/HRSchedule";
import HRLeave from "./pages/hr/HRLeave";
import HRPayroll from "./pages/hr/HRPayroll";

const queryClient = new QueryClient();

const pageKeyMap: Record<string, string> = {
  "/": "revenue",
  
  "/forecast": "forecast",
  "/activity-log": "activity-log",
  "/pl-report": "pl-report",
  "/invoices": "invoices",
  "/procurement": "invoices",
  "/inventory": "inventory",
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
          <PreviewModeProvider>
            <Toaster />
            <Sonner />
            <PreviewBanner />
            <BrowserRouter>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/" element={<ProtectedRoute pageKey="revenue"><Index /></ProtectedRoute>} />
                
                <Route path="/forecast/:venue" element={<ProtectedRoute pageKey="forecast"><ForecastInput /></ProtectedRoute>} />
                <Route path="/activity-log" element={<ProtectedRoute pageKey="activity-log"><AuditLog /></ProtectedRoute>} />
                <Route path="/pl-report" element={<ProtectedRoute pageKey="pl-report"><PLReport /></ProtectedRoute>} />
                <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
                <Route path="/user-access" element={<AdminRoute><UserAccessControl /></AdminRoute>} />
                <Route path="/invoices" element={<ProtectedRoute pageKey="invoices"><Invoices /></ProtectedRoute>} />
                <Route path="/procurement" element={<Navigate to="/procurement/dashboard" replace />} />
                <Route path="/procurement/dashboard" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="dashboard" /></ProtectedRoute>} />
                <Route path="/procurement/suppliers" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="suppliers" /></ProtectedRoute>} />
                <Route path="/procurement/products" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="product-master" /></ProtectedRoute>} />
                <Route path="/procurement/invoices" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="invoices" /></ProtectedRoute>} />
                <Route path="/procurement/line-items" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="line-items" /></ProtectedRoute>} />
                <Route path="/procurement/inventory" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="inventory" /></ProtectedRoute>} />
                <Route path="/procurement/menu-costing" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="menu-costing" /></ProtectedRoute>} />
                <Route path="/procurement/documents" element={<ProtectedRoute pageKey="invoices"><Procurement defaultTab="documents" /></ProtectedRoute>} />
                
                <Route path="/hr" element={<Navigate to="/hr/employees" replace />} />
                <Route path="/hr/employees" element={<AdminRoute><HREmployees /></AdminRoute>} />
                <Route path="/hr/schedule" element={<AdminRoute><HRSchedule /></AdminRoute>} />
                <Route path="/hr/leave" element={<AdminRoute><HRLeave /></AdminRoute>} />
                <Route path="/hr/payroll" element={<AdminRoute><HRPayroll /></AdminRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              <AssistantWidget />
            </BrowserRouter>
          </PreviewModeProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
