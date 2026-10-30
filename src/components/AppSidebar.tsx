import {
  LogOut, Users, Building2, BrainCircuit,
  TrendingUp, Scale, ChevronDown, Target,
  ShoppingCart, ReceiptText, Landmark, CreditCard, Coins,
  Settings, HandCoins, ArrowLeft, ChevronsLeft, ChevronsRight, UserRound, Package,
} from "lucide-react";

import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useTenantSession } from "@/hooks/useTenantSession";
import { supabase } from "@/integrations/supabase/client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router-dom";
import { useRevenueNavigationAccess } from "@/hooks/useRevenueNavigationAccess";
import { isRevenueRoute, revenueLanding, revenueSection } from "@/utils/revenueNavigation";
import { useKpiCapability } from "@/hooks/useKpiCapability";
import { peopleNavigationPath } from "@/components/hr/PeopleNavigation";
import { BaniLoginMark } from "@/components/brand/BaniLoginMark";
import { isStockMenuRoute, matchesPurchasingPath, purchasingParentPath, purchasingSectionPages, stockMenuSectionPages } from "@/utils/purchasingNavigation";
import { usePurchasingNavigationAccess } from "@/hooks/usePurchasingNavigationAccess";

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

/** Child link that is active by an explicit flag (for section sub-pages). */
function FlagChildLink({ title, to, active }: { title: string; to: string; active: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild className="p-0 h-auto hover:bg-transparent active:bg-transparent data-[active=true]:bg-transparent">
        <Link to={to} aria-current={active ? "page" : undefined}
          className={cn("relative flex items-center pl-9 pr-3 py-1.5 rounded-md text-[13px] text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors", active && "glass-active !text-sidebar-primary font-medium")}>
          <span className="truncate">{title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

type RailItem = { title: string; to: string; icon: any; active: boolean };
function CollapsedRail({ items, onExpand }: { items: RailItem[]; onExpand: () => void }) {
  return (
    <SidebarContent className="bani-rail items-center gap-1 pb-2">
      <div className="bani-rail-head flex h-[52px] w-full shrink-0 items-center justify-center mb-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={onExpand} aria-label="Expand sidebar" className="bani-rail-expand inline-flex h-[34px] w-[34px] items-center justify-center rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
              <ChevronsRight className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipPortal><TooltipContent side="right" sideOffset={10} className="bani-rail-tip z-[70]">Expand sidebar</TooltipContent></TooltipPortal>
        </Tooltip>
      </div>
      {items.map((it) => (
        <Tooltip key={it.title}>
          <TooltipTrigger asChild>
            <Link to={it.to} aria-label={it.title} aria-current={it.active ? "page" : undefined}
              className={cn("bani-rail-item inline-flex h-[38px] w-[38px] items-center justify-center rounded-[9px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring", it.active && "is-active")}>
              <it.icon className="h-[18px] w-[18px]" strokeWidth={it.active ? 2.2 : 1.8} />
            </Link>
          </TooltipTrigger>
          <TooltipPortal><TooltipContent side="right" sideOffset={10} className="bani-rail-tip z-[70]">{it.title}</TooltipContent></TooltipPortal>
        </Tooltip>
      ))}
    </SidebarContent>
  );
}

type Item = { title: string; url: string; pageKey?: string; end?: boolean; disabled?: boolean };

const navItems: (Item & { icon: any })[] = [
  { title: "Your team", url: "/", icon: Users, pageKey: "home", end: true },

  { title: "Bani AI", url: "/assistant", icon: BrainCircuit, pageKey: "assistant" },
];

const financeItems: Item[] = [
  { title: "Overview", url: "/finance/dashboard", end: true },
  { title: "Document Centre", url: "/finance/document-centre" },
  { title: "Documents & Bills", url: "/finance/documents-bills" },
  { title: "Accounts Payable", url: "/finance/payables" },
  { title: "Accounts Receivable", url: "/finance/receivables" },
];

// Staff Reimbursements — its own top-level group.
// Structure mirrors Petty Cash so `Operations` / `Master Data` sub-sections
// can be added later without reshaping the group.
const staffReimbOverview: Item = { title: "Overview", url: "/staff-reimbursements", end: true };

const financeReportsItems: Item[] = [
  { title: "Profit & Loss", url: "/pl-report", pageKey: "pl-report" },
  { title: "P&L (Ledger)", url: "/finance/pl-ledger" },
  { title: "Balance Sheet", url: "/finance/balance-sheet" },
  { title: "Cash Flow", url: "/finance/cashflow-report" },
  { title: "Trial Balance", url: "/finance/trial-balance" },
];

const financeAccountingItems: Item[] = [
  { title: "Journal", url: "/finance/journal" },
  { title: "Ledger", url: "/finance/ledger" },
  { title: "Chart of Accounts", url: "/finance/chart-of-accounts" },
  { title: "Ledger Audit Log", url: "/finance/ledger-audit" },
];

const expensesOverview: Item = { title: "Overview", url: "/expenses", end: true };
const expensesMasterData: Item[] = [
  { title: "Categories", url: "/expenses/categories" },
  { title: "Vendors", url: "/expenses/vendors" },
  { title: "Mapping", url: "/expenses/mapping" },
];
const expensesBillsVendors: Item[] = [
  { title: "Expense Bills", url: "/expenses/bills" },
  
  { title: "Recurring Expenses", url: "/expenses/recurring" },
  { title: "Bank-Detected", url: "/expenses/bank-detected" },
];
const expensesApprovals: Item[] = [{ title: "Approvals", url: "/expenses/approvals" }];
const expensesAnalytics: Item[] = [{ title: "Analytics", url: "/expenses/analytics" }];
const expensesFinance: Item[] = [
  { title: "Spend Summary", url: "/expenses/finance/spend" },
  { title: "Vendor Accounts", url: "/expenses/finance/vendors" },
  { title: "Open Payables", url: "/expenses/finance/payables" },
];

const bankOverview: Item = { title: "Overview", url: "/bank/dashboard" };
const bankAccounts: Item[] = [
  { title: "Bank Accounts", url: "/bank/accounts" },
  { title: "Transfers", url: "/bank/transfers" },
  { title: "FX & Multi-Currency", url: "/bank/fx" },
];
const bankTransactions: Item[] = [
  { title: "All Transactions", url: "/bank/transactions" },
  { title: "Incoming", url: "/bank/incoming" },
  { title: "Outgoing", url: "/bank/outgoing" },
];
const bankReconciliation: Item[] = [
  { title: "Reconciliation", url: "/bank/reconciliation" },
  { title: "Payment Matching", url: "/bank/matching" },
  { title: "Rules", url: "/bank/rules" },
];
const bankReporting: Item[] = [{ title: "Bank Fees", url: "/bank/fees" }];

const paymentsOverview: Item = { title: "Overview", url: "/payments", end: true };
const paymentsMasterData: Item[] = [
  { title: "Processors", url: "/payments/processors" },
  { title: "Merchants", url: "/payments/merchants" },
  { title: "Fee Rates", url: "/payments/fee-rates" },
];
const paymentsOperations: Item[] = [
  { title: "Imports", url: "/payments/imports" },
  { title: "Settlement Batches", url: "/payments/batches" },
  { title: "Fee Audit", url: "/payments/fee-audit" },
];
const paymentsReconciliation: Item[] = [
  { title: "Monthly Check", url: "/payments/monthly" },
];

const pettyCashOverview: Item = { title: "Overview", url: "/petty-cash", end: true };
const pettyCashOps: Item[] = [
  { title: "Receipts", url: "/petty-cash/receipts" },
  { title: "Replenishments", url: "/petty-cash/replenishments" },
];
const pettyCashMaster: Item[] = [
  { title: "Floats", url: "/petty-cash/floats" },
  { title: "Classifications", url: "/petty-cash/classifications" },
];




const STORAGE_KEY = "khambu.sidebar.groups";
type GroupKey = "revenue" | "kpi" | "finance" | "expenses" | "bank" | "payments" | "pettycash" | "staffreimb" | "hr" | "admin" | "platform";

function loadGroupState(): Record<GroupKey, boolean> {
  const def: Record<GroupKey, boolean> = { revenue: true, kpi: true, finance: true, expenses: true, bank: true, payments: true, pettycash: true, staffreimb: true, hr: true, admin: true, platform: true };
  if (typeof window === "undefined") return def;
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) {
    const saved = JSON.parse(raw);
    return Object.fromEntries(Object.entries(def).map(([key, value]) => [key, typeof saved?.[key] === "boolean" ? saved[key] : value])) as Record<GroupKey, boolean>;
  } } catch { /* */ }
  return def;
}

// ---- Shared item renderers ----

function ChildLink({ item }: { item: Item }) {
  const { pathname } = useLocation();
  if (item.url.startsWith("/procurement/")) {
    const active = matchesPurchasingPath(purchasingParentPath(pathname), item.url);
    return <SidebarMenuItem>
      <SidebarMenuButton asChild className="p-0 h-auto hover:bg-transparent active:bg-transparent data-[active=true]:bg-transparent">
        <Link to={item.url} aria-current={active ? "page" : undefined} className={cn(
          "relative flex items-center pl-6 pr-3 py-1.5 rounded-md text-[13px] text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors",
          active && "glass-active !text-sidebar-primary font-medium",
        )}><span className="truncate">{item.title}</span></Link>
      </SidebarMenuButton>
    </SidebarMenuItem>;
  }
  if (item.disabled) {
    return (
      <SidebarMenuItem>
        <div className="pl-6 pr-3 py-1.5 rounded-md text-[13px] text-sidebar-foreground opacity-40 pointer-events-none">
          {item.title}
        </div>
      </SidebarMenuItem>
    );
  }
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild className="p-0 h-auto hover:bg-transparent active:bg-transparent data-[active=true]:bg-transparent">
        <NavLink
          to={item.url}
          end={item.end ?? item.url === "/"}
          className="relative flex items-center pl-6 pr-3 py-1.5 rounded-md text-[13px] text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
          activeClassName="glass-active !text-sidebar-primary font-medium"
        >
          <span className="truncate">{item.title}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function TopLink({ item }: { item: Item & { icon: any } }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild className="p-0 h-auto hover:bg-transparent active:bg-transparent data-[active=true]:bg-transparent">
        <NavLink
          to={item.url}
          end={item.end ?? item.url === "/"}
          className="relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
          activeClassName="glass-active !text-sidebar-primary font-medium"
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.title}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SubSection({ label, items }: { label: string; items: Item[] }) {
  return (
    <div>
      <div className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      <SidebarMenu>
        {items.map((it) => <ChildLink key={it.url} item={it} />)}
      </SidebarMenu>
    </div>
  );
}

function CollapsibleNavGroup({
  label,
  icon: Icon,
  defaultOpen,
  onOpenChange,
  children,
}: {
  label: string;
  icon: any;
  defaultOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible
      open={open}
      onOpenChange={(o) => { setOpen(o); onOpenChange(o); }}
    >
      <SidebarGroup className="py-0 px-2">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel
            className={cn(
              "flex items-center justify-between w-full min-h-10 px-2 rounded-md cursor-pointer",
              "text-[12px] font-medium tracking-wide text-sidebar-foreground/80",
              "hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors",
            )}
          >
            <span className="flex items-center gap-2.5">
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                open ? "rotate-0" : "-rotate-90",
              )}
            />
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
  const { pathname, search } = useLocation();
  const revenueAccess = useRevenueNavigationAccess();
  const purchasingAccess = usePurchasingNavigationAccess();
  const stockMenuActive = isStockMenuRoute(pathname);
  const purchasingActive = pathname.startsWith("/procurement/") && !stockMenuActive;
  const purchasingChildren = purchasingSectionPages.filter(purchasingAccess.canOpen);
  const stockMenuChildren = stockMenuSectionPages.filter(purchasingAccess.canOpen);
  const purchasingChildActive = (url: string) => matchesPurchasingPath(purchasingParentPath(pathname), url);
  const revenueDestination = revenueLanding(revenueAccess.sidebarRevenue, revenueAccess.sidebarForecast);
  const revenueActive = isRevenueRoute(pathname) && revenueSection(pathname) !== "setup";
  const { user, isAdmin, signOut } = useAuth();
  const { previewUserId, isPreviewActive } = usePreviewMode();
  const { isPlatformAdmin } = usePlatformAdmin();
  const { activeTenantId, isInsideClient, exitToPlatform } = useTenantSession();
  const [clientName, setClientName] = useState("");

  const effectiveUserId = isPreviewActive && isAdmin ? previewUserId : user?.id;
  const { showInSidebar, canAccessPage, loading: permissionsLoading } = useUserPermissions(effectiveUserId || undefined);
  const showKpi = !permissionsLoading && ((isAdmin && !isPreviewActive) || (showInSidebar("kpis") && canAccessPage("kpis")));
  const kpiActive = pathname === "/kpis" || pathname.startsWith("/kpis/");

  const [groupState, setGroupState] = useState<Record<GroupKey, boolean>>(loadGroupState);

  useEffect(() => {
    if (!activeTenantId) { setClientName(""); return; }
    let cancelled = false;
    supabase.from("tenants").select("name").eq("id", activeTenantId).maybeSingle().then(({ data }) => {
      if (!cancelled) setClientName(data?.name ?? "");
    });
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const { state, isMobile, setOpen, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  useEffect(() => { setOpenMobile(false); }, [pathname, setOpenMobile]);
  const kpiCap = useKpiCapability();
  const revSection = revenueSection(pathname);
  const revenueChildren = [
    { key: "overview", title: "Overview", to: "/revenue", allowed: revenueAccess.revenue },
    { key: "sales", title: "Sales records", to: "/sales-data", allowed: revenueAccess.revenue },
    { key: "analysis", title: "Trends", to: "/revenue/analysis", allowed: revenueAccess.revenue },
    { key: "targets", title: "Targets", to: "/revenue/targets-new", allowed: revenueAccess.forecast },
  ].filter((c) => c.allowed);
  const kpiChildren = (kpiCap.loading || (!kpiCap.isGlobalAdmin && !canAccessPage("kpis"))) ? [] : [
    { title: "My KPIs", to: "/kpis/my-cards", allowed: true },
    { title: "Planner", to: "/kpis/planner", allowed: kpiCap.canPlan },
    { title: "KPI Setup", to: "/kpis/setup", allowed: kpiCap.canConfigure },
  ].filter((c) => c.allowed);
  const kpiChildActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`)
    || (to === "/kpis/setup" && ["/kpis/assignments", "/kpis/targets"].some((r) => pathname === r || pathname.startsWith(`${r}/`)));
  const peopleChildren = [
    { title: "Overview", to: "/hr" }, { title: "Employees", to: "/hr/employees" }, { title: "Schedule", to: "/hr/schedule" },
    { title: "Leave", to: "/hr/leave" }, { title: "Payroll", to: "/hr/payroll" }, { title: "Payroll Payables", to: "/hr/payroll/payables" },
  ];
  const peopleActivePath = peopleNavigationPath(pathname);
  const showSubPages = !isMobile;

  const setGroup = (key: GroupKey, open: boolean) => {
    setGroupState((prev) => {
      const next = { ...prev, [key]: open };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const visibleItems = navItems.filter(item => {
    if (item.pageKey === "home") return true;
    if (isAdmin && !isPreviewActive) return true;
    return showInSidebar(item.pageKey!);
  });

  const canSeeSection = (pageKey: string): boolean => {
    if (isPlatformAdmin) return true;
    if (isAdmin && !isPreviewActive) return true;
    return showInSidebar(pageKey);
  };

  const showFinance     = canSeeSection("finance");
  const showProcurement = canSeeSection("procurement");
  const showHR          = canSeeSection("people");
  const showBank        = canSeeSection("bank");
  const showPayments    = canSeeSection("payments");
  const showPettyCash   = canSeeSection("pettycash");
  const showStaffReimb  = canSeeSection("staff_reimbursements");
  const showAdmin       = isAdmin && !isPreviewActive;
  const showPlatform    = isPlatformAdmin && !isPreviewActive;

  return (
    <Sidebar variant="sidebar" collapsible="icon">
      {collapsed ? (
        <div className={cn(isPreviewActive && "mt-10")} />
      ) : (
      <div className={cn("pb-3 border-b border-sidebar-border space-y-2.5", isPreviewActive && "mt-10")}>
        <div className="bani-sidebar-head flex h-[52px] items-center gap-2 px-4">
          <BaniLoginMark className="bani-brand-mark h-[30px] w-[18px] shrink-0" />
          <span className="bani-brand-word font-light tracking-tight leading-none">Bani</span>
          {!isMobile && (
            <button type="button" onClick={() => setOpen(false)} aria-label="Collapse sidebar"
              className="bani-collapse-btn ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
              <ChevronsLeft className="h-4 w-4" />
            </button>
          )}
        </div>
        {clientName && (
          <div className="bani-client-box mx-3 flex items-center gap-2.5 px-2.5 py-2">
            <div className="h-7 w-7 rounded-md bg-white text-[11px] font-semibold flex items-center justify-center shrink-0 shadow-sm">
              {initialsOf(clientName)}
            </div>
            <div className="min-w-0 text-[13px] font-semibold truncate">{clientName}</div>
          </div>
        )}
        {isPlatformAdmin && isInsideClient && (
          <div className="border-t border-sidebar-border/60 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={exitToPlatform}
              className="h-7 w-full justify-start px-1.5 text-[11px] text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Exit to Platform
            </Button>
          </div>
        )}
      </div>
      )}

      {collapsed ? (
        <CollapsedRail onExpand={() => setOpen(true)} items={[
          ...visibleItems.map((it) => ({ title: it.title, to: it.url, icon: it.icon, active: it.end ? pathname === it.url : pathname === it.url || pathname.startsWith(it.url + "/") })),
          ...(revenueDestination ? [{ title: "Revenue", to: revenueDestination, icon: TrendingUp, active: revenueActive }] : []),
          ...(showProcurement ? [
            { title: "Purchasing", to: "/procurement/dashboard", icon: ShoppingCart, active: purchasingActive },
            { title: "Stock & menu", to: "/procurement/inventory", icon: Package, active: stockMenuActive },
          ] : []),
          ...(showFinance ? [{ title: "Expenses", to: "/expenses", icon: ReceiptText, active: pathname.startsWith("/expenses") }] : []),
          ...(showHR ? [{ title: "People", to: "/hr", icon: Users, active: pathname === "/hr" || pathname.startsWith("/hr/") }] : []),
          ...(showKpi ? [{ title: "KPI", to: "/kpis/my-cards", icon: Target, active: kpiActive }] : []),
          ...(showFinance ? [{ title: "Finance", to: "/finance/dashboard", icon: Scale, active: pathname.startsWith("/finance/") || pathname === "/pl-report" }] : []),
          ...(showBank ? [{ title: "Bank", to: "/bank/dashboard", icon: Landmark, active: pathname.startsWith("/bank") }] : []),
          ...(showPayments ? [{ title: "Payments", to: "/payments", icon: CreditCard, active: pathname.startsWith("/payments") }] : []),
          ...(showPettyCash ? [{ title: "Petty Cash", to: "/petty-cash", icon: Coins, active: pathname.startsWith("/petty-cash") }] : []),
          ...(showStaffReimb ? [{ title: "Staff Reimbursements", to: "/staff-reimbursements", icon: HandCoins, active: pathname.startsWith("/staff-reimbursements") }] : []),
          ...(showAdmin ? [{ title: "Settings", to: "/user-access", icon: Settings, active: ["/notifications", "/user-access", "/admin", "/revenue/setup", "/activity-log"].some((r) => pathname.startsWith(r)) }] : []),
          ...(showPlatform ? [{ title: "Platform", to: "/platform/clients", icon: Building2, active: pathname.startsWith("/platform") }] : []),
        ]} />
      ) : (
      <SidebarContent className="py-2 gap-3">
        {/* Top-level items, no group label */}
        <SidebarGroup className="py-0 px-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {visibleItems.map((it) => <TopLink key={it.url} item={it} />)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="mx-3 h-px bg-sidebar-border/60" />

        {revenueDestination && (
          <SidebarGroup className="py-0 px-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="p-0 h-auto hover:bg-transparent active:bg-transparent data-[active=true]:bg-transparent">
                  <Link to={revenueDestination === pathname ? pathname + search : revenueDestination} aria-current={revenueActive ? "page" : undefined}
                    className={cn("relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors", revenueActive && "glass-active !text-sidebar-primary font-medium")}>
                    <TrendingUp className="h-4 w-4 shrink-0" /><span>Revenue</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {showSubPages && revenueActive && revenueChildren.map((c) => <FlagChildLink key={c.key} title={c.title} to={c.to} active={revSection === c.key} />)}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {showProcurement && (
          <SidebarGroup className="py-0 px-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="p-0 h-auto hover:bg-transparent active:bg-transparent data-[active=true]:bg-transparent">
                  <Link to="/procurement/dashboard" aria-current={purchasingActive ? "page" : undefined}
                    className={cn("relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors", purchasingActive && "glass-active !text-sidebar-primary font-medium")}>
                    <ShoppingCart className="h-4 w-4 shrink-0" /><span>Purchasing</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {showSubPages && purchasingActive && purchasingChildren.map((item) => <React.Fragment key={item.url}>
                {["/procurement/purchase-orders", "/procurement/suppliers"].includes(item.url) && <li role="separator" className="mx-3 my-2 h-px bg-sidebar-border/60" />}
                <FlagChildLink title={item.title} to={item.url} active={purchasingChildActive(item.url)} />
              </React.Fragment>)}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {showProcurement && (
          <SidebarGroup className="py-0 px-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="p-0 h-auto hover:bg-transparent active:bg-transparent data-[active=true]:bg-transparent">
                  <Link to="/procurement/inventory" aria-current={stockMenuActive ? "page" : undefined}
                    className={cn("relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors", stockMenuActive && "glass-active !text-sidebar-primary font-medium")}>
                    <Package className="h-4 w-4 shrink-0" /><span>Stock & menu</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {showSubPages && stockMenuActive && stockMenuChildren.map((item) => <React.Fragment key={item.url}>
                <FlagChildLink title={item.title} to={item.url} active={purchasingChildActive(item.url)} />
              </React.Fragment>)}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {showFinance && (
          <CollapsibleNavGroup
            label="Expenses"
            icon={ReceiptText}
            defaultOpen={groupState.expenses}
            onOpenChange={(o) => setGroup("expenses", o)}
          >
            <SidebarMenu className="gap-1 pt-1">
              <ChildLink item={expensesOverview} />
            </SidebarMenu>
            <SubSection label="Master Data" items={expensesMasterData} />
            <SubSection label="Bills & Vendors" items={expensesBillsVendors} />
            <SubSection label="Approvals" items={expensesApprovals} />
            <SubSection label="Analytics" items={expensesAnalytics} />
            <SubSection label="Finance" items={expensesFinance} />
          </CollapsibleNavGroup>
        )}

        {showHR && (
          <SidebarGroup className="py-0 px-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="p-0 h-auto hover:bg-transparent active:bg-transparent data-[active=true]:bg-transparent">
                  <Link to={pathname === "/hr" ? pathname + search : "/hr"} aria-current={pathname === "/hr" || pathname.startsWith("/hr/") ? "page" : undefined}
                    className={cn("relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors", (pathname === "/hr" || pathname.startsWith("/hr/")) && "glass-active !text-sidebar-primary font-medium")}>
                    <Users className="h-4 w-4 shrink-0" /><span>People</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {showSubPages && (pathname === "/hr" || pathname.startsWith("/hr/")) && peopleChildren.map((c) => <FlagChildLink key={c.to} title={c.title} to={c.to} active={peopleActivePath === c.to} />)}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {showKpi && (
          <SidebarGroup className="py-0 px-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="p-0 h-auto hover:bg-transparent active:bg-transparent data-[active=true]:bg-transparent">
                  <Link to={pathname === "/kpis/my-cards" ? pathname + search : "/kpis/my-cards"} aria-current={kpiActive ? "page" : undefined}
                    className={cn("relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors", kpiActive && "glass-active !text-sidebar-primary font-medium")}>
                    <Target className="h-4 w-4 shrink-0" /><span>KPI</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {showSubPages && kpiActive && kpiChildren.map((c) => <FlagChildLink key={c.to} title={c.title} to={c.to} active={kpiChildActive(c.to)} />)}
            </SidebarMenu>
          </SidebarGroup>
        )}


        {showFinance && (
          <CollapsibleNavGroup
            label="Finance"
            icon={Scale}
            defaultOpen={groupState.finance}
            onOpenChange={(o) => setGroup("finance", o)}
          >
            <SidebarMenu className="gap-1 pt-1">
              {financeItems.map((it) => <ChildLink key={it.url} item={it} />)}
            </SidebarMenu>
            <SubSection label="Reports" items={financeReportsItems} />
            <SubSection label="Accounting" items={financeAccountingItems} />
          </CollapsibleNavGroup>
        )}


        {showBank && (
          <CollapsibleNavGroup
            label="Bank"
            icon={Landmark}
            defaultOpen={groupState.bank}
            onOpenChange={(o) => setGroup("bank", o)}
          >
            <SidebarMenu className="gap-1 pt-1">
              <ChildLink item={bankOverview} />
            </SidebarMenu>
            <SubSection label="Accounts" items={bankAccounts} />
            <SubSection label="Transactions" items={bankTransactions} />
            <SubSection label="Reconciliation" items={bankReconciliation} />
            <SubSection label="Reporting" items={bankReporting} />
          </CollapsibleNavGroup>
        )}

        {showPayments && (
          <CollapsibleNavGroup
            label="Payments"
            icon={CreditCard}
            defaultOpen={groupState.payments}
            onOpenChange={(o) => setGroup("payments", o)}
          >
            <SidebarMenu className="gap-1 pt-1">
              <ChildLink item={paymentsOverview} />
            </SidebarMenu>
            <SubSection label="Master Data" items={paymentsMasterData} />
            <SubSection label="Operations" items={paymentsOperations} />
            <SubSection label="Reconciliation" items={paymentsReconciliation} />
          </CollapsibleNavGroup>
        )}

        {showPettyCash && (
          <CollapsibleNavGroup
            label="Petty Cash"
            icon={Coins}
            defaultOpen={groupState.pettycash}
            onOpenChange={(o) => setGroup("pettycash", o)}
          >
            <SidebarMenu className="gap-1 pt-1">
              <ChildLink item={pettyCashOverview} />
            </SidebarMenu>
            <SubSection label="Operations" items={pettyCashOps} />
            <SubSection label="Master Data" items={pettyCashMaster} />
          </CollapsibleNavGroup>
        )}

        {showStaffReimb && (
          <CollapsibleNavGroup
            label="Staff Reimbursements"
            icon={HandCoins}
            defaultOpen={groupState.staffreimb}
            onOpenChange={(o) => setGroup("staffreimb", o)}
          >
            <SidebarMenu className="gap-1 pt-1">
              <ChildLink item={staffReimbOverview} />
            </SidebarMenu>
            {/* Future: <SubSection label="Operations" items={...} /> and Master Data */}
          </CollapsibleNavGroup>
        )}




        {showAdmin && (
          <CollapsibleNavGroup
            label="Settings"
            icon={Settings}
            defaultOpen={groupState.admin}
            onOpenChange={(o) => setGroup("admin", o)}
          >
            <SidebarMenu className="gap-1 pt-1">
              {[
                { title: "Notifications", url: "/notifications" },
                { title: "User Access", url: "/user-access" },
                { title: "Business & venues", url: "/admin/structure" },
                { title: "Revenue setup", url: "/revenue/setup" },
                { title: "Master Data", url: "/admin/master-data" },
                { title: "AI Learned Rules", url: "/admin/ai-rules" },
                
                { title: "Preferences", url: "/admin/preferences" },
                { title: "Activity Log", url: "/activity-log" },
                { title: "Opening Balances", url: "/procurement/finance/onboarding" },
              ].map((it) => <ChildLink key={it.url} item={it} />)}
            </SidebarMenu>
          </CollapsibleNavGroup>
        )}

        {showPlatform && (
          <CollapsibleNavGroup
            label="Platform"
            icon={Building2}
            defaultOpen={groupState.platform}
            onOpenChange={(o) => setGroup("platform", o)}
          >
            <SidebarMenu className="gap-1 pt-1">
              <ChildLink item={{ title: "Clients", url: "/platform/clients" }} />
            </SidebarMenu>
          </CollapsibleNavGroup>
        )}

      </SidebarContent>
      )}

      {!collapsed && <SidebarFooter className="border-t border-sidebar-border p-3">
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
      </SidebarFooter>}
    </Sidebar>
  );
}

