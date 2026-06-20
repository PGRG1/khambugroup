import {
  BarChart3,
  ClipboardList,
  LogOut,
  Settings,
  FileText,
  Receipt,
  Users,
  Package,
  UserCog,
  DollarSign,
  LayoutDashboard,
  BrainCircuit,
  SlidersHorizontal,
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
  Sparkles,
  Target,
  Bell,
  Home,
  ShoppingCart,
  Boxes,
  UsersRound,
  GitCompareArrows,
  CalendarClock,
  PiggyBank,
  Crosshair,
  LineChart,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
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

type NavItem = { title: string; url: string; icon: any; end?: boolean };

const navItems: NavItem[] = [
  { title: "Home", url: "/", icon: Home, end: true },
  { title: "AI Analyst", url: "/assistant", icon: BrainCircuit },
  { title: "Activity Log", url: "/activity-log", icon: FileText },
];

const performanceItems: NavItem[] = [
  { title: "Revenue Overview", url: "/revenue", icon: BarChart3 },
  { title: "Sales Data", url: "/sales-data", icon: Database },
  { title: "Target Tracking", url: "/forecast/assembly", icon: Target },
  { title: "My KPI Cards", url: "/kpis/my-cards", icon: LineChart },
  { title: "KPI Assignment", url: "/kpis/assignments", icon: UserCog },
  { title: "KPI Targets", url: "/kpis/targets", icon: Crosshair },
  { title: "KPI Planner", url: "/kpis/planner", icon: Target },
];

const planningItems: NavItem[] = [
  { title: "Overview", url: "/forecast/assembly", icon: LayoutDashboard },
  { title: "Budget vs Actual", url: "/forecast/assembly", icon: GitCompareArrows },
  { title: "Forecasts", url: "/forecast/assembly", icon: TrendingUp },
  { title: "Scenario Planning", url: "/forecast/assembly", icon: ClipboardList },
  { title: "Cash Forecast", url: "/finance/cashflow-report", icon: PiggyBank },
  { title: "Cost Planning", url: "/forecast/assembly", icon: CalendarClock },
  { title: "Target Setting", url: "/kpis/targets", icon: Crosshair },
];

const operationsItems: NavItem[] = [
  { title: "Procurement", url: "/procurement/dashboard", icon: ShoppingCart },
  { title: "Inventory", url: "/procurement/inventory", icon: Boxes },
  { title: "Expenses", url: "/expenses", icon: Receipt, end: true },
  { title: "People", url: "/hr/employees", icon: UsersRound },
];

const financeItems: NavItem[] = [
  { title: "Overview", url: "/finance/dashboard", icon: LayoutDashboard },
  { title: "Accounts Payable", url: "/finance/payables", icon: CreditCard },
  { title: "Accounts Receivable", url: "/finance/receivables", icon: Wallet },
  { title: "Payments & Settlements", url: "/finance/payments-settlements", icon: TrendingUp },
  { title: "Bank Reconciliation", url: "/finance/bank-reconciliation", icon: Landmark },
];

const accountingItems: NavItem[] = [
  { title: "Profit & Loss", url: "/finance/pl-ledger", icon: Receipt },
  { title: "Balance Sheet", url: "/finance/balance-sheet", icon: Scale },
  { title: "Cash Flow", url: "/finance/cashflow-report", icon: TrendingUp },
  { title: "Trial Balance", url: "/finance/trial-balance", icon: BookText },
  { title: "Journal Entries", url: "/finance/journal", icon: NotebookPen },
  { title: "General Ledger", url: "/finance/ledger", icon: BookOpen },
  { title: "Chart of Accounts", url: "/finance/chart-of-accounts", icon: ListTree },
  { title: "Ledger Audit Log", url: "/finance/ledger-audit", icon: History },
];

const adminItems: NavItem[] = [
  { title: "Notifications", url: "/notifications", icon: Bell },
  { title: "User Access", url: "/user-access", icon: UserCog },
  { title: "System Configuration", url: "/admin/system-configuration", icon: SlidersHorizontal },
  { title: "AI Learned Rules", url: "/admin/ai-rules", icon: Sparkles },
  { title: "Settings", url: "/settings", icon: Settings },
];

function SectionLabel({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <SidebarGroupLabel
      className="text-[10px] font-semibold tracking-[0.18em] uppercase px-3 pt-4 pb-1"
      style={{ color }}
    >
      {children}
    </SidebarGroupLabel>
  );
}

function renderLink(item: NavItem) {
  return (
    <SidebarMenuItem key={`${item.title}-${item.url}`}>
      <SidebarMenuButton asChild>
        <NavLink
          to={item.url}
          end={item.end ?? item.url === "/"}
          className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
        >
          <item.icon className="h-4 w-4 opacity-80" />
          <span>{item.title}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { user, isAdmin, signOut } = useAuth();
  const { isPreviewActive } = usePreviewMode();
  const isFullAdmin = isAdmin && !isPreviewActive;

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
          <SidebarGroupLabel className="text-[10px] font-semibold tracking-[0.18em] uppercase px-3 pt-3 pb-1 text-muted-foreground">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{navItems.map(renderLink)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SectionLabel color="hsl(265 85% 70%)">Performance</SectionLabel>
          <SidebarGroupContent>
            <SidebarMenu>{performanceItems.map(renderLink)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isFullAdmin && (
          <SidebarGroup>
            <SectionLabel color="hsl(199 90% 65%)">Planning (FP&amp;A)</SectionLabel>
            <SidebarGroupContent>
              <SidebarMenu>{planningItems.map(renderLink)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isFullAdmin && (
          <SidebarGroup>
            <SectionLabel color="hsl(152 76% 55%)">Operations</SectionLabel>
            <SidebarGroupContent>
              <SidebarMenu>{operationsItems.map(renderLink)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isFullAdmin && (
          <SidebarGroup>
            <SectionLabel color="hsl(42 92% 60%)">Finance</SectionLabel>
            <SidebarGroupContent>
              <SidebarMenu>{financeItems.map(renderLink)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isFullAdmin && (
          <SidebarGroup>
            <SectionLabel color="hsl(280 75% 70%)">Accounting &amp; Reports</SectionLabel>
            <SidebarGroupContent>
              <SidebarMenu>{accountingItems.map(renderLink)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isFullAdmin && (
          <SidebarGroup>
            <SectionLabel color="hsl(0 0% 65%)">Admin</SectionLabel>
            <SidebarGroupContent>
              <SidebarMenu>{adminItems.map(renderLink)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
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
