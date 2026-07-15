import {
  LogOut, FileText, Users, Building2, BrainCircuit,
  TrendingUp, Scale, ChevronDown, Target,
  Home, ShoppingCart, ReceiptText, Landmark, CreditCard, Coins,
  Settings, HandCoins,
} from "lucide-react";

import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";

import React, { useState } from "react";
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
import { cn } from "@/lib/utils";

type Item = { title: string; url: string; pageKey?: string; end?: boolean; disabled?: boolean };

const navItems: (Item & { icon: any })[] = [
  { title: "Home", url: "/", icon: Home, pageKey: "home", end: true },
  { title: "AI Analyst", url: "/assistant", icon: BrainCircuit, pageKey: "assistant" },
  { title: "Activity Log", url: "/activity-log", icon: FileText, pageKey: "activity-log" },
];

const revenueItems: Item[] = [
  { title: "Overview", url: "/revenue", pageKey: "revenue", end: true },
  { title: "Daily Sales", url: "/sales-data", pageKey: "revenue" },
  { title: "Targets", url: "/forecast/assembly", pageKey: "forecast" },
  { title: "Service Periods", url: "/revenue/service-periods", pageKey: "revenue" },
  { title: "Reconciliation", url: "/revenue/reconciliation", pageKey: "revenue" },
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
  { title: "Payment Terms", url: "/expenses/payment-terms" },
];
const expensesBillsVendors: Item[] = [
  { title: "Expense Bills", url: "/expenses/bills" },
  { title: "Vendor Statements", url: "/expenses/statements" },
  { title: "Recurring Expenses", url: "/expenses/recurring" },
  { title: "Bank-Detected", url: "/expenses/bank-detected" },
];
const expensesApprovals: Item[] = [{ title: "Approvals", url: "/expenses/approvals" }];
const expensesAnalytics: Item[] = [{ title: "Analytics", url: "/expenses/analytics" }];
const expensesFinance: Item[] = [
  { title: "Spend Summary", url: "/expenses/finance/spend", disabled: true },
  { title: "Vendor Accounts", url: "/expenses/finance/vendors", disabled: true },
  { title: "Open Payables", url: "/expenses/finance/payables", disabled: true },
];

const procurementOverview: Item = { title: "Overview", url: "/procurement/dashboard" };
const procurementMasterData: Item[] = [
  { title: "Suppliers & Vendors", url: "/procurement/suppliers" },
  { title: "Items Master", url: "/procurement/products" },
  { title: "Categories & Units", url: "/procurement/categories" },
];
const procurementPurchasing: Item[] = [
  { title: "Purchase Orders", url: "/procurement/purchase-orders" },
  { title: "Goods Receipts / GRNs", url: "/procurement/receiving" },
  { title: "Invoices", url: "/procurement/invoices" },
  { title: "Purchase Register", url: "/procurement/line-items" },
  { title: "Deposit Ledger", url: "/procurement/deposit-ledger" },
  { title: "Credit & Debit Notes", url: "/procurement/credit-notes" },
  { title: "Documents", url: "/procurement/documents" },
];
const procurementInventory: Item[] = [
  { title: "Stock on Hand", url: "/procurement/inventory" },
  { title: "Stock Counts", url: "/procurement/stock-counts" },
  // "Stock Movements" hidden until the module is built.
  { title: "Transfers", url: "/procurement/transfers" },
  { title: "Waste & Adjustments", url: "/procurement/waste" },
];
const procurementCosting: Item[] = [
  { title: "Recipes & Menu Costing", url: "/procurement/menu-costing" },
];
const procurementAnalysis: Item[] = [
  { title: "Purchase Analysis", url: "/procurement/purchase-analysis" },
  { title: "Supplier Pricing", url: "/procurement/supplier-pricing" },
  // "Inventory Variance" hidden until the module is built.
];
const procurementFinance: Item[] = [
  { title: "Spend Summary", url: "/procurement/finance/spend" },
  { title: "Supplier Accounts", url: "/procurement/finance/suppliers" },
  { title: "Open Payables", url: "/procurement/finance/payables" },
  { title: "Opening Balances", url: "/procurement/finance/onboarding" },
  // "Payments" hidden until the module is built.
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

const hrItems: Item[] = [
  { title: "Dashboard", url: "/hr" },
  { title: "Employee Directory", url: "/hr/employees" },
  { title: "Schedule", url: "/hr/schedule" },
  { title: "Leave Management", url: "/hr/leave" },
  { title: "Payroll", url: "/hr/payroll" },
  { title: "Org Chart", url: "/hr/org-chart" },
];

const kpiItems: Item[] = [
  { title: "My KPI Cards", url: "/kpis/my-cards", pageKey: "kpis" },
];
const kpiAdminItems: Item[] = [
  { title: "KPI Assignment", url: "/kpis/assignments" },
  { title: "KPI Targets", url: "/kpis/targets" },
  { title: "KPI Planner", url: "/kpis/planner" },
];

const STORAGE_KEY = "khambu.sidebar.groups";
type GroupKey = "revenue" | "kpi" | "finance" | "expenses" | "procurement" | "bank" | "payments" | "pettycash" | "staffreimb" | "hr" | "admin" | "platform";

function loadGroupState(): Record<GroupKey, boolean> {
  const def: Record<GroupKey, boolean> = { revenue: true, kpi: true, finance: true, expenses: true, procurement: true, bank: true, payments: true, pettycash: true, staffreimb: true, hr: true, admin: true, platform: true };
  if (typeof window === "undefined") return def;
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return { ...def, ...JSON.parse(raw) }; } catch { /* */ }
  return def;
}

// ---- Shared item renderers ----

function ChildLink({ item }: { item: Item }) {
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
          activeClassName="!bg-sidebar-accent !text-sidebar-primary font-medium [&>span.active-bar]:opacity-100"
        >
          <span className="active-bar absolute left-1 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-sidebar-primary opacity-0 transition-opacity" />
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
          activeClassName="!bg-sidebar-accent !text-sidebar-primary font-medium [&>span.active-bar]:opacity-100"
        >
          <span className="active-bar absolute left-1 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-sidebar-primary opacity-0 transition-opacity" />
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
  const { user, isAdmin, signOut } = useAuth();
  const { previewUserId, isPreviewActive } = usePreviewMode();

  const effectiveUserId = isPreviewActive && isAdmin ? previewUserId : user?.id;
  const { showInSidebar } = useUserPermissions(effectiveUserId || undefined);

  const [groupState, setGroupState] = useState<Record<GroupKey, boolean>>(loadGroupState);

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

  const visibleRevenueItems = revenueItems.filter(item => {
    if (isAdmin && !isPreviewActive) return true;
    return showInSidebar(item.pageKey!);
  });

  const { isPlatformAdmin } = usePlatformAdmin();

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
    <Sidebar className="border-r border-sidebar-border">
      {/* Workspace identity */}
      <div className={cn("px-4 py-3.5 border-b border-sidebar-border", isPreviewActive && "mt-10")}>
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary font-semibold flex items-center justify-center text-sm shrink-0">
            K
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-sidebar-foreground leading-tight truncate">
              KHAMBU Group
            </div>
            <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              Operating Workspace
            </div>
          </div>
        </div>
      </div>

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

        {visibleRevenueItems.length > 0 && (
          <CollapsibleNavGroup
            label="Revenue"
            icon={TrendingUp}
            defaultOpen={groupState.revenue}
            onOpenChange={(o) => setGroup("revenue", o)}
          >
            <SidebarMenu className="gap-1 pt-1">
              {visibleRevenueItems.map((it) => <ChildLink key={it.url} item={it} />)}
            </SidebarMenu>
          </CollapsibleNavGroup>
        )}

        <CollapsibleNavGroup
          label="KPI Management"
          icon={Target}
          defaultOpen={groupState.kpi}
          onOpenChange={(o) => setGroup("kpi", o)}
        >
          <SidebarMenu className="gap-1 pt-1">
            {kpiItems.map((it) => <ChildLink key={it.url} item={it} />)}
            {isAdmin && !isPreviewActive && kpiAdminItems.map((it) => <ChildLink key={it.url} item={it} />)}
          </SidebarMenu>
        </CollapsibleNavGroup>

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

        {showProcurement && (
          <CollapsibleNavGroup
            label="Procurement"
            icon={ShoppingCart}
            defaultOpen={groupState.procurement}
            onOpenChange={(o) => setGroup("procurement", o)}
          >
            <SidebarMenu className="gap-1 pt-1">
              <ChildLink item={procurementOverview} />
            </SidebarMenu>
            <SubSection label="Master Data" items={procurementMasterData} />
            <SubSection label="Purchasing" items={procurementPurchasing} />
            <SubSection label="Inventory" items={procurementInventory} />
            <SubSection label="Costing" items={procurementCosting} />
            <SubSection label="Analysis" items={procurementAnalysis} />
            <SubSection label="Finance" items={procurementFinance} />
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

        {showHR && (
          <CollapsibleNavGroup
            label="People"
            icon={Users}
            defaultOpen={groupState.hr}
            onOpenChange={(o) => setGroup("hr", o)}
          >
            <SidebarMenu className="gap-1 pt-1">
              {hrItems.map((it) => <ChildLink key={it.url} item={it} />)}
            </SidebarMenu>
          </CollapsibleNavGroup>
        )}

        {showAdmin && (
          <CollapsibleNavGroup
            label="Admin"
            icon={Settings}
            defaultOpen={groupState.admin}
            onOpenChange={(o) => setGroup("admin", o)}
          >
            <SidebarMenu className="gap-1 pt-1">
              {[
                { title: "Notifications", url: "/notifications" },
                { title: "User Access", url: "/user-access" },
                { title: "Business Structure", url: "/admin/structure" },
                { title: "Master Data", url: "/admin/master-data" },
                { title: "AI Learned Rules", url: "/admin/ai-rules" },
                { title: "Preferences", url: "/admin/preferences" },
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

