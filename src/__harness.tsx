import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { PreviewModeProvider } from "@/hooks/usePreviewMode";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AppLayout } from "@/components/AppLayout";
import Landing from "@/pages/Landing";
import "./index.css";
localStorage.setItem("khambu.activeTenantId", "00000000-0000-0000-0000-00000000beef");
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={qc}><TooltipProvider><AuthProvider><ThemeProvider><PreviewModeProvider><BrowserRouter>
    <AppLayout><Landing /></AppLayout>
  </BrowserRouter></PreviewModeProvider></ThemeProvider></AuthProvider></TooltipProvider></QueryClientProvider>);
