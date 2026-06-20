import {
  BarChart3,
  ClipboardList,
  LogOut,
  Settings,
  FileText,
  Receipt,
  Users,
  FileSpreadsheet,
  Package,
  UserCog,
  Calendar,
  DollarSign,
  LayoutDashboard,
  Building2,
  UtensilsCrossed,
  FolderDown,
  BrainCircuit,
  SlidersHorizontal,
  Tags,
  TrendingUp,
  Scale,
  BookOpen,
  NotebookPen,
  Database,
  ListTree,
  BookText,
  Wallet,
  CreditCard,
  History,
  Landmark,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  FileStack,
  Sparkles,
  Target,
  Bell,
  Repeat,
  CheckCircle2,
  Home,
  Inbox,
  ArrowLeftRight,
  Coins,
  Banknote,
  LineChart,
  PieChart,
  CalendarClock,
  GitBranch,
  FileMinus,
  HandCoins,
  ScrollText,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useState, useEffect } from "react";
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

type NavItem = {
  title: string;
  url: string;
  icon: any;
  pageKey?: string;
  end?: boolean;
  isNew?: boolean;
};

// ===== HOME =====
const homeItems: NavItem[] = [
  { title: "Home", url: "/", icon: Home, pageKey: "home", end: true },
  { title: "Work Queue", url: "/work-queue", icon: Inbox, isNew: true },
  { title: "AI Analyst", url: "/assistant", icon: BrainCircuit, pageKey: "assistant" },
  { title: "Activity Log", url: "/activity-log", icon: FileText, pageKey: "activity-log" },
];

// ===== PERFORMANCE =====
const performanceRevenueItems: NavItem[] = [
  { title: "Revenue Overview", url: "/revenue", icon: BarChart3, pageKey: "revenue" },
  { title: "Sales Data", url: "/sales-data", icon: Database, pageKey: "revenue" },
  { title: "Target Tracking", url: "/forecast/assembly", icon: Target, pageKey: "forecast" },
];
const performanceKpiItems: NavItem[] = [
  { title: "My KPI Cards", url: "/kpis/my-cards", icon: Target, pageKey: "kpis" },
  { title: "KPI Assignment", url: "/kpis/assignments", icon: UserCog },
  { title: "KPI Targets", url: "/kpis/targets", icon: Target },
  { title: "KPI Planner", url: "/kpis/planner", icon: Target },
];

// ===== PLANNING (FP&A) =====
const planningItems: NavItem[] = [
  { title: "Overview", url: "/planning", icon: LayoutDashboard, isNew: true },
  { title: "Budget vs Actual", url: "/planning/budget-vs-actual", icon: BarChart3, isNew: true },
  { title: "Forecasts", url: "/planning/forecasts", icon: LineChart, isNew: true },
  { title: "Scenario Planning", url: "/planning/scenarios", icon: GitBranch, isNew: true },
  { title: "Cash Forecast", url: "/planning/cash-forecast", icon: CalendarClock, isNew: true },
  { title: "Cost Planning", url: "/planning/cost-planning", icon: PieChart, isNew: true },
  { title: "Target Setting", url: "/planning/target-setting", icon: Target, isNew: true },
];

// ===== OPERATIONS =====
const procurementItems: NavItem[] = [
  { title: "Overview", url: "/procurement/dashboard", icon: LayoutDashboard },
  { title: "Suppliers & Vendors", url: "/procurement/suppliers", icon: Building2 },
  { title: "Items Master", url: "/procurement/products", icon: Package },
  { title: "Categories", url: "/procurement/categories", icon: Tags },
  { title: "Invoices", url: "/procurement/invoices", icon: FileSpreadsheet },
  { title: "Credit Notes", url: "/procurement/credit-notes", icon: FileMinus, isNew: true },
  { title: "Invoice Line Items", url: "/procurement/line-items", icon: FileText },
  { title: "Supplier Statements", url: "/procurement/supplier-statements", icon: FileStack, isNew: true },
  { title: "Inventory", url: "/procurement/inventory", icon: ClipboardList },
  { title: "Menu Costing", url: "/procurement/menu-costing", icon: UtensilsCrossed },
  { title: "Documents", url: "/procurement/documents", icon: FolderDown },
];
const expensesItems: NavItem[] = [
  { title: "Overview", url: "/expenses", icon: LayoutDashboard, end: true },
  { title: "Expense Bills", url: "/expenses/bills", icon: Receipt },
  { title: "Vendor Statements", url: "/expenses/statements", icon: FileStack },
  { title: "Bank-Detected", url: "/expenses/bank-detected", icon: Landmark },
  { title: "Recurring Expenses", url: "/expenses/recurring", icon: Repeat },
  { title: "Categories", url: "/expenses/categories", icon: Tags },
  { title: "Approvals", url: "/expenses/approvals", icon: CheckCircle2 },
  { title: "Analytics", url: "/expenses/analytics", icon: BarChart3 },
];
const peopleItems: NavItem[] = [
  { title: "Employee Directory", url: "/hr/employees", icon: Users },
  { title: "Org Chart", url: "/hr/org-chart", icon: Building2 },
  { title: "Schedule", url: "/hr/schedule", icon: Calendar },
  { title: "Leave Management", url: "/hr/leave", icon: FileText },
  { title: "Payroll", url: "/hr/payroll", icon: DollarSign },
];

// ===== FINANCE =====
const financeItems: NavItem[] = [
  { title: "Overview", url: "/finance/dashboard", icon: LayoutDashboard },
  { title: "Document Centre", url: "/finance/document-centre", icon: FolderOpen },
  { title: "Documents & Bills", url: "/finance/documents-bills", icon: FileStack },
  { title: "Accounts Payable", url: "/finance/payables", icon: CreditCard },
  { title: "Accounts Receivable", url: "/finance/receivables", icon: Wallet },
];
const paymentsSettlementsItems: NavItem[] = [
  { title: "Overview", url: "/finance/payments-settlements", icon: LayoutDashboard },
  { title: "Supplier Payments", url: "/finance/supplier-payments", icon: HandCoins },
  { title: "Payment Allocations", url: "/finance/payment-allocations", icon: ArrowLeftRight, isNew: true },
  { title: "Processor Settlements", url: "/finance/processor-settlements", icon: TrendingUp },
  { title: "Supplier Refunds", url: "/finance/supplier-refunds", icon: FileMinus, isNew: true },
];
const bankingItems: NavItem[] = [
  { title: "Bank Accounts", url: "/finance/bank-accounts", icon: Landmark, isNew: true },
  { title: "Bank Transactions", url: "/finance/bank-transactions", icon: ScrollText, isNew: true },
  { title: "Bank Reconciliation", url: "/finance/bank-reconciliation", icon: Landmark },
  { title: "Transfers", url: "/finance/transfers", icon: ArrowLeftRight, isNew: true },
  { title: "Cash & Petty Cash", url: "/finance/cash-petty-cash", icon: Coins, isNew: true },
];

// ===== ACCOUNTING & REPORTS =====
const reportsItems: NavItem[] = [
  { title: "Profit & Loss", url: "/finance/pl-ledger", icon: Receipt },
  { title: "Balance Sheet", url: "/finance/balance-sheet", icon: Scale },
  { title: "Cash Flow", url: "/finance/cashflow-report", icon: TrendingUp },
  { title: "Trial Balance", url: "/finance/trial-balance", icon: BookText },
];
const accountingItems: NavItem[] = [
  { title: "Journal Entries", url: "/finance/journal", icon: NotebookPen },
  { title: "General Ledger", url: "/finance/ledger", icon: BookOpen },
  { title: "Chart of Accounts", url: "/finance/chart-of-accounts", icon: ListTree },
  { title: "Ledger Audit Log", url: "/finance/ledger-audit", icon: History },
];

// ===== ADMIN =====
const adminItems: NavItem[] = [
  { title: "Notifications", url: "/notifications", icon: Bell },
  { title: "User Access", url: "/user-access", icon: UserCog },
  { title: "System Configuration", url: "/admin/system-configuration", icon: SlidersHorizontal },
  { title: "AI Learned Rules", url: "/admin/ai-rules", icon: Sparkles },
  { title: "Settings", url: "/settings", icon: Settings },
];

type GroupKey =
  | "home"
  | "performance"
  | "planning"
  | "operations"
  | "finance"
  | "accounting"
  | "admin";

const STORAGE_KEY = "khambu.sidebar.groups.v2";

function CollapsibleNavGroup({
  label,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <SidebarGroup>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="flex items-center justify-between cursor-pointer hover:text-sidebar-foreground transition-colors">
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

function SubGroup({ label, items, renderLink }: { label: string; items: NavItem[]; renderLink: (i: NavItem) => JSX.Element }) {
  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between cursor-pointer px-3 pt-3 pb-1 text-[10px] font-semibold tracking-[0.14em] uppercase text-sidebar-primary/80 hover:text-sidebar-primary transition-colors group/sub">
          <span className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-sidebar-primary/60" />
            {label}
          </span>
          <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]/sub:-rotate-90" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-4 pl-2 border-l border-sidebar-border/60">
          <SidebarMenu>{items.map(renderLink)}</SidebarMenu>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AppSidebar() {
  const { user, isAdmin, signOut } = useAuth();
  const { previewUserId, isPreviewActive } = usePreviewMode();

  const effectiveUserId = isPreviewActive && isAdmin ? previewUserId : user?.id;
  const { showInSidebar } = useUserPermissions(effectiveUserId || undefined);

  const [groupState, setGroupState] = useState<Record<GroupKey, boolean>>({
    home: true,
    performance: false,
    planning: false,
    operations: false,
    finance: false,
    accounting: false,
    admin: false,
  });

  const setGroup = (key: GroupKey, open: boolean) => {
    setGroupState((prev) => ({ ...prev, [key]: open }));
  };

  useEffect(() => {
    try {
      localStorage.removeItem("khambu.sidebar.groups");
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const adminFull = isAdmin && !isPreviewActive;

  const renderLink = (item: NavItem) => (
    <SidebarMenuItem key={item.title + item.url}>
      <SidebarMenuButton asChild>
        <NavLink
          to={item.url}
          end={item.end ?? item.url === "/"}
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
        >
          <span className="flex items-center gap-2 min-w-0">
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.title}</span>
          </span>
          {item.isNew && (
            <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              NEW
            </span>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  const visibleHome = homeItems.filter((i) => {
    if (i.pageKey === "home" || !i.pageKey) return true;
    if (adminFull) return true;
    return showInSidebar(i.pageKey);
  });
  const visibleRevenue = performanceRevenueItems.filter((i) =>
    adminFull || !i.pageKey ? true : showInSidebar(i.pageKey)
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
        {/* HOME */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-base font-normal">Home</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{visibleHome.map(renderLink)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* PERFORMANCE */}
        {(visibleRevenue.length > 0 || adminFull) && (
          <CollapsibleNavGroup
            label="Performance"
            open={groupState.performance}
            onOpenChange={(o) => setGroup("performance", o)}
          >
            <SubGroup label="Revenue" items={visibleRevenue} renderLink={renderLink} />
            <SubGroup
              label="KPI Management"
              items={adminFull ? performanceKpiItems : performanceKpiItems.filter((i) => i.pageKey === "kpis")}
              renderLink={renderLink}
            />
          </CollapsibleNavGroup>
        )}

        {/* PLANNING */}
        {adminFull && (
          <CollapsibleNavGroup
            label="Planning (FP&A)"
            open={groupState.planning}
            onOpenChange={(o) => setGroup("planning", o)}
          >
            <SidebarMenu>{planningItems.map(renderLink)}</SidebarMenu>
          </CollapsibleNavGroup>
        )}

        {/* OPERATIONS */}
        {(adminFull || showInSidebar("invoices")) && (
          <CollapsibleNavGroup
            label="Operations"
            open={groupState.operations}
            onOpenChange={(o) => setGroup("operations", o)}
          >
            <SubGroup label="Procurement" items={procurementItems} renderLink={renderLink} />
            {adminFull && <SubGroup label="Expenses" items={expensesItems} renderLink={renderLink} />}
            {adminFull && <SubGroup label="People" items={peopleItems} renderLink={renderLink} />}
          </CollapsibleNavGroup>
        )}

        {/* FINANCE */}
        {adminFull && (
          <CollapsibleNavGroup
            label="Finance"
            open={groupState.finance}
            onOpenChange={(o) => setGroup("finance", o)}
          >
            <SidebarMenu>{financeItems.map(renderLink)}</SidebarMenu>
            <SubGroup label="Payments & Settlements" items={paymentsSettlementsItems} renderLink={renderLink} />
            <SubGroup label="Banking" items={bankingItems} renderLink={renderLink} />
          </CollapsibleNavGroup>
        )}

        {/* ACCOUNTING & REPORTS */}
        {adminFull && (
          <CollapsibleNavGroup
            label="Accounting & Reports"
            open={groupState.accounting}
            onOpenChange={(o) => setGroup("accounting", o)}
          >
            <SubGroup label="Reports" items={reportsItems} renderLink={renderLink} />
            <SubGroup label="Accounting" items={accountingItems} renderLink={renderLink} />
          </CollapsibleNavGroup>
        )}

        {/* ADMIN */}
        {adminFull && (
          <CollapsibleNavGroup
            label="Admin"
            open={groupState.admin}
            onOpenChange={(o) => setGroup("admin", o)}
          >
            <SidebarMenu>{adminItems.map(renderLink)}</SidebarMenu>
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
