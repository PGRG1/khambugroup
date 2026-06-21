import { BarChart3, ClipboardList, LogOut, Settings, FileText, Receipt, Users, FileSpreadsheet, Package, UserCog, Calendar, DollarSign, LayoutDashboard, Building2, UtensilsCrossed, FolderDown, BrainCircuit, SlidersHorizontal, Tags, TrendingUp, Scale, BookOpen, NotebookPen, Database, ListTree, BookText, Wallet, CreditCard, History, Landmark, ChevronDown, ChevronUp, FolderOpen, FileStack, Sparkles, Target, Bell, Repeat, CheckCircle2, Home } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";

import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const navItems = [
  { title: "Home", url: "/", icon: Home, pageKey: "home", end: true },
  { title: "AI Analyst", url: "/assistant", icon: BrainCircuit, pageKey: "assistant" },
  { title: "Activity Log", url: "/activity-log", icon: FileText, pageKey: "activity-log" },
];

const revenueItems = [
  { title: "Overview", url: "/revenue", icon: BarChart3, pageKey: "revenue" },
  { title: "Sales Data", url: "/sales-data", icon: Database, pageKey: "revenue" },
  { title: "Target Tracking", url: "/forecast/assembly", icon: Target, pageKey: "forecast" },
];


const financeItems = [
  { title: "Overview", url: "/finance/dashboard", icon: LayoutDashboard },
  { title: "Document Centre", url: "/finance/document-centre", icon: FolderOpen },
  { title: "Documents & Bills", url: "/finance/documents-bills", icon: FileStack },
  { title: "Accounts Payable", url: "/finance/payables", icon: CreditCard },
  { title: "Accounts Receivable", url: "/finance/receivables", icon: Wallet },
  { title: "Payments & Settlements", url: "/finance/payments-settlements", icon: TrendingUp },
  { title: "Bank Reconciliation", url: "/finance/bank-reconciliation", icon: Landmark },
];

const expensesItems = [
  { title: "Overview", url: "/expenses", icon: LayoutDashboard, end: true },
  { title: "Expense Bills", url: "/expenses/bills", icon: Receipt },
  { title: "Vendor Statements", url: "/expenses/statements", icon: FileStack },
  { title: "Bank-Detected", url: "/expenses/bank-detected", icon: Landmark },
  { title: "Recurring Expenses", url: "/expenses/recurring", icon: Repeat },
  { title: "Categories", url: "/expenses/categories", icon: Tags },
  { title: "Approvals", url: "/expenses/approvals", icon: CheckCircle2 },
  { title: "Analytics", url: "/expenses/analytics", icon: BarChart3 },
];

const financeReportsItems = [
  { title: "Profit & Loss", url: "/pl-report", icon: Receipt, pageKey: "pl-report" },
  { title: "Profit & Loss", url: "/finance/pl-ledger", icon: Receipt },
  { title: "Balance Sheet", url: "/finance/balance-sheet", icon: Scale },
  { title: "Cash Flow", url: "/finance/cashflow-report", icon: TrendingUp },
  { title: "Trial Balance", url: "/finance/trial-balance", icon: BookText },
];

const financeAccountingItems = [
  { title: "Journal", url: "/finance/journal", icon: NotebookPen },
  { title: "Ledger", url: "/finance/ledger", icon: BookOpen },
  { title: "Chart of Accounts", url: "/finance/chart-of-accounts", icon: ListTree },
  { title: "Ledger Audit Log", url: "/finance/ledger-audit", icon: History },
];

const procurementItems = [
  { title: "Overview", url: "/procurement/dashboard", icon: LayoutDashboard },
  { title: "Suppliers & Vendors", url: "/procurement/suppliers", icon: Building2 },
  { title: "Items Master", url: "/procurement/products", icon: Package },
  { title: "Categories", url: "/procurement/categories", icon: Tags },
  { title: "Invoices", url: "/procurement/invoices", icon: FileSpreadsheet },
  { title: "Invoice Line Items", url: "/procurement/line-items", icon: FileText },
  { title: "Inventory", url: "/procurement/inventory", icon: ClipboardList },
  { title: "Menu Costing", url: "/procurement/menu-costing", icon: UtensilsCrossed },
  { title: "Documents", url: "/procurement/documents", icon: FolderDown },
];

const hrItems = [
  { title: "Employee Directory", url: "/hr/employees", icon: Users },
  { title: "Org Chart", url: "/hr/org-chart", icon: Building2 },
  { title: "Schedule", url: "/hr/schedule", icon: Calendar },
  { title: "Leave Management", url: "/hr/leave", icon: FileText },
  { title: "Payroll", url: "/hr/payroll", icon: DollarSign },
];

const kpiItems = [
  { title: "My KPI Cards", url: "/kpis/my-cards", icon: Target, pageKey: "kpis" },
];
const kpiAdminItems = [
  { title: "KPI Assignment", url: "/kpis/assignments", icon: UserCog },
  { title: "KPI Targets", url: "/kpis/targets", icon: Target },
  { title: "KPI Planner", url: "/kpis/planner", icon: Target },
];

const STORAGE_KEY = "khambu.sidebar.groups";

type GroupKey = "revenue" | "kpi" | "finance" | "expenses" | "procurement" | "hr" | "admin";

function loadGroupState(): Record<GroupKey, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { revenue: false, kpi: false, finance: false, expenses: false, procurement: false, hr: false, admin: false };
}

function CollapsibleNavGroup({
  groupKey,
  label,
  defaultOpen,
  onOpenChange,
  children,
}: {
  groupKey: GroupKey;
  label: string;
  defaultOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        onOpenChange(o);
      }}
    >
      <SidebarGroup>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="flex items-center justify-between cursor-pointer hover:text-sidebar-foreground transition-colors group/label">
            <span className="text-base font-normal">{label}</span>
            {open ? (
              <ChevronUp className="h-3.5 w-3.5 transition-transform duration-200" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200" />
            )}
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>{children}</SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

export function AppSidebar() {
  const { user, isAdmin, signOut } = useAuth();
  const { previewUserId, isPreviewActive } = usePreviewMode();
  const location = useLocation();

  const effectiveUserId = isPreviewActive && isAdmin ? previewUserId : user?.id;
  const { showInSidebar } = useUserPermissions(effectiveUserId || undefined);

  // All nav groups start collapsed by default; user toggles persist for the session only
  const [groupState, setGroupState] = useState<Record<GroupKey, boolean>>({
    revenue: false,
    kpi: false,
    finance: false,
    expenses: false,
    procurement: false,
    hr: false,
    admin: false,
  });

  const setGroup = (key: GroupKey, open: boolean) => {
    setGroupState((prev) => ({ ...prev, [key]: open }));
  };

  // Clear any previously persisted sidebar state so collapsed-by-default truly applies
  useEffect(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  const visibleItems = navItems.filter(item => {
    if (item.pageKey === "home") return true;
    if (isAdmin && !isPreviewActive) return true;
    return showInSidebar(item.pageKey);
  });


  const visibleRevenueItems = revenueItems.filter(item => {
    if (isAdmin && !isPreviewActive) return true;
    return showInSidebar(item.pageKey);
  });

  const showFinance = isAdmin && !isPreviewActive;
  const showProcurement = isAdmin && !isPreviewActive ? true : showInSidebar("invoices");
  const showHR = isAdmin && !isPreviewActive;
  const showAdmin = isAdmin && !isPreviewActive;
  const { isPlatformAdmin } = usePlatformAdmin();
  const showPlatform = isPlatformAdmin && !isPreviewActive;


  const renderLink = (item: { title: string; url: string; icon: any; end?: boolean }) => (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton asChild>
        <NavLink
          to={item.url}
          end={item.end ?? item.url === "/"}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
        >
          <item.icon className="h-4 w-4" />
          <span>{item.title}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar className="border-r border-sidebar-border">
      <div className={`p-4 border-b border-sidebar-border ${isPreviewActive ? "mt-10" : ""}`}>
        <h1 className="text-xl font-bold font-display tracking-tight">
          <span className="text-gradient-gold">KHAMBU GROUP</span>
        </h1>
        <p className="text-[10px] text-muted-foreground mt-0.5">Analytics Overview</p>
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-base font-normal">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{visibleItems.map(renderLink)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleRevenueItems.length > 0 && (
          <CollapsibleNavGroup
            groupKey="revenue"
            label="Revenue"
            defaultOpen={groupState.revenue}
            onOpenChange={(o) => setGroup("revenue", o)}
          >
            <SidebarMenu>{visibleRevenueItems.map(renderLink)}</SidebarMenu>
          </CollapsibleNavGroup>
        )}

        <CollapsibleNavGroup
          groupKey="kpi"
          label="KPI Management"
          defaultOpen={groupState.kpi}
          onOpenChange={(o) => setGroup("kpi", o)}
        >
          <SidebarMenu>
            {kpiItems.map(renderLink)}
            {isAdmin && !isPreviewActive && kpiAdminItems.map(renderLink)}
          </SidebarMenu>
        </CollapsibleNavGroup>

        {showFinance && (
          <CollapsibleNavGroup
            groupKey="finance"
            label="Finance"
            defaultOpen={groupState.finance}
            onOpenChange={(o) => setGroup("finance", o)}
          >
            <SidebarMenu>{financeItems.map(renderLink)}</SidebarMenu>

            <div className="mt-3 mx-3 h-px bg-sidebar-border/60" />

            <Collapsible>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between cursor-pointer px-3 pt-3 pb-1 text-[10px] font-semibold tracking-[0.14em] uppercase text-sidebar-primary/80 hover:text-sidebar-primary transition-colors group/sub">
                  <span className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-sidebar-primary/60" />
                    Reports
                  </span>
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]/sub:-rotate-90" />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-4 pl-2 border-l border-sidebar-border/60">
                  <SidebarMenu>{financeReportsItems.map(renderLink)}</SidebarMenu>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible>
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between cursor-pointer px-3 pt-3 pb-1 text-[10px] font-semibold tracking-[0.14em] uppercase text-sidebar-primary/80 hover:text-sidebar-primary transition-colors group/sub">
                  <span className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-sidebar-primary/60" />
                    Accounting
                  </span>
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]/sub:-rotate-90" />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-4 pl-2 border-l border-sidebar-border/60">
                  <SidebarMenu>{financeAccountingItems.map(renderLink)}</SidebarMenu>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CollapsibleNavGroup>
        )}

        {showFinance && (
          <CollapsibleNavGroup
            groupKey="expenses"
            label="Expenses"
            defaultOpen={groupState.expenses}
            onOpenChange={(o) => setGroup("expenses", o)}
          >
            <SidebarMenu>{expensesItems.map(renderLink)}</SidebarMenu>
          </CollapsibleNavGroup>
        )}

        {showProcurement && (
          <CollapsibleNavGroup
            groupKey="procurement"
            label="Procurement"
            defaultOpen={groupState.procurement}
            onOpenChange={(o) => setGroup("procurement", o)}
          >
            <SidebarMenu>{procurementItems.map(renderLink)}</SidebarMenu>
          </CollapsibleNavGroup>
        )}

        {showHR && (
          <CollapsibleNavGroup
            groupKey="hr"
            label="People"
            defaultOpen={groupState.hr}
            onOpenChange={(o) => setGroup("hr", o)}
          >
            <SidebarMenu>{hrItems.map(renderLink)}</SidebarMenu>
          </CollapsibleNavGroup>
        )}

        {showAdmin && (
          <CollapsibleNavGroup
            groupKey="admin"
            label="Admin"
            defaultOpen={groupState.admin}
            onOpenChange={(o) => setGroup("admin", o)}
          >
            <SidebarMenu>
              {renderLink({ title: "Notifications", url: "/notifications", icon: Bell })}
              {renderLink({ title: "User Access", url: "/user-access", icon: UserCog })}
              {renderLink({ title: "System Configuration", url: "/admin/system-configuration", icon: SlidersHorizontal })}
              {renderLink({ title: "AI Learned Rules", url: "/admin/ai-rules", icon: Sparkles })}
              {renderLink({ title: "Settings", url: "/settings", icon: Settings })}
            </SidebarMenu>
          </CollapsibleNavGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {user && (
          <p className="text-[11px] text-muted-foreground mb-2 truncate px-1">{user.email}</p>
        )}
        <button
          onClick={signOut}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
        <div className="mt-3 pt-3 border-t border-sidebar-border/60 px-1">
          <p className="text-[10px] text-sidebar-foreground/50 tracking-wide">
            Powered by <span className="text-sidebar-primary font-semibold">Bani</span>
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
