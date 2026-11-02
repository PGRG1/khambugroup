import {
  LogOut, Users, UserRound, Search,
  TrendingUp, Scale, ChevronDown,
  ShoppingCart, ReceiptText, Landmark, CreditCard, Coins,
  Settings, HandCoins, ArrowLeft, ChevronsLeft, ChevronsRight, Package,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useNavigate } from "react-router-dom";
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
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
import { useTeamOpenCounts } from "@/hooks/useTeamOpenCounts";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { usePeopleSettings } from "@/hooks/usePeopleSettings";
import { useVenueScope } from "@/hooks/useVenueScope";
import { peopleNavigationPath } from "@/components/hr/PeopleNavigation";
import { visibleExpenseTabs } from "@/utils/expenses";
import { financeTabs } from "@/utils/financeClose";
import { useExpenseClaimsExist } from "@/hooks/useExpenseClaimsExist";
import { BaniLoginMark } from "@/components/brand/BaniLoginMark";
import { SUPPLIER_DIRECTORY_TAB, isSupplierDirectoryRoute, isStockMenuRoute, matchesPurchasingPath, purchasingParentPath, purchasingSectionPages, stockMenuSectionPages } from "@/utils/purchasingNavigation";
import { usePurchasingNavigationAccess } from "@/hooks/usePurchasingNavigationAccess";

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

/** Small Bani orb used as the Home icon. */
function HomeOrb({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block rounded-full shrink-0", className)} style={{ background: "radial-gradient(circle at 32% 28%, #5ED8C8 0%, #3FB5A6 22%, #5E9A90 48%, #5F8C82 74%, #2F5E5A 100%)" }} />;
}
/** Amber count of open finance-team findings; hidden at 0. */
function Count({ n }: { n: number }) {
  if (!n) return null;
  return <span className="bani-count ml-auto" aria-label={`${n} need you`}>{n}</span>;
}
const roleWords = (r?: string) => (!r ? "" : ["tenant_admin", "platform_admin", "super_admin", "owner", "admin"].includes(r) ? "Owner" : r === "manager" ? "Manager" : "Team");

/** Child link that is active by an explicit flag (for section sub-pages). */
function FlagChildLink({ title, to, active }: { title: string; to: string; active: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild className="p-0 h-auto hover:bg-transparent active:bg-transparent data-[active=true]:bg-transparent">
        <Link to={to} aria-current={active ? "page" : undefined}
          className={cn("bani-sub relative flex items-center pl-9 pr-3 py-1.5 rounded-md text-[13px] text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors", active && "glass-active !text-sidebar-primary font-medium")}>
          <span className="truncate">{title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

type RailItem = { title: string; to: string; icon: any; active: boolean; dot?: boolean };
function CollapsedRail({ items, onExpand, footer }: { items: RailItem[]; onExpand: () => void; footer?: React.ReactNode }) {
  return (
    <SidebarContent className="bani-rail items-center gap-1 pb-2">
      <div className="bani-rail-head flex h-[52px] w-full shrink-0 items-center justify-center mb-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={onExpand} aria-label="Expand sidebar" className="bani-rail-expand bani-rail-logo inline-flex h-[34px] w-[34px] items-center justify-center rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
              <BaniLoginMark className="bani-rail-mark h-[26px] w-[16px]" /><ChevronsRight className="bani-rail-chev h-4 w-4" />
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
              <span className="relative inline-flex"><it.icon className="h-[18px] w-[18px]" strokeWidth={it.active ? 2.2 : 1.8} />{it.dot && <span className="bani-dot" aria-hidden="true" />}</span>
            </Link>
          </TooltipTrigger>
          <TooltipPortal><TooltipContent side="right" sideOffset={10} className="bani-rail-tip z-[70]">{it.title}</TooltipContent></TooltipPortal>
        </Tooltip>
      ))}
      {footer && <div className="mt-auto pt-2">{footer}</div>}
    </SidebarContent>
  );
}

/** Navigation-only page finder (⌘K). Never sends anything to Bani. */
function GoToPage({ pages }: { pages: { title: string; to: string }[] }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Go to a page" className="bani-goto mx-3 flex items-center gap-2 rounded-md px-2.5 h-9 text-[13px]">
      <Search className="h-4 w-4 shrink-0" /><span className="flex-1 text-left">Go to a page</span><kbd className="text-[11px]">⌘K</kbd>
    </button>
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Go to a page" aria-label="Go to a page" />
      <CommandList>
        <CommandEmpty>No page found.</CommandEmpty>
        {pages.map((p) => <CommandItem key={p.to + p.title} value={p.title + " " + p.to} onSelect={() => { setOpen(false); navigate(p.to); }}>{p.title}</CommandItem>)}
      </CommandList>
    </CommandDialog>
  </>;
}

/** Small centred account pop-up: name, email, password reset and sign out. */
function AccountDialog({ open, onOpenChange, name, email, onSignOut }: { open: boolean; onOpenChange: (o: boolean) => void; name: string; email: string; onSignOut: () => void }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) setMsg(""); }, [open]);
  const reset = async () => {
    if (!email) return; setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setMsg(error ? error.message : "We've emailed you a link to change your password."); setBusy(false);
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-[400px]">
      <DialogHeader><DialogTitle>Your account</DialogTitle></DialogHeader>
      <div className="space-y-1"><p className="font-medium">{name || "—"}</p><p className="text-sm text-muted-foreground break-all">{email}</p></div>
      {msg && <p className="text-sm text-muted-foreground" role="status">{msg}</p>}
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="outline" disabled={busy || !email} onClick={() => void reset()}>Change password</Button>
        <Button onClick={onSignOut}><LogOut className="h-4 w-4" />Sign out</Button>
      </div>
    </DialogContent>
  </Dialog>;
}

type Item = { title: string; url: string; pageKey?: string; end?: boolean; disabled?: boolean };

const navItems: (Item & { icon: any })[] = [
  { title: "Bani team", url: "/", icon: HomeOrb, pageKey: "home", end: true },
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
          "bani-sub relative flex items-center pl-6 pr-3 py-1.5 rounded-md text-[13px] text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors",
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
          className="bani-sub relative flex items-center pl-6 pr-3 py-1.5 rounded-md text-[13px] text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
          activeClassName="glass-active !text-sidebar-primary font-medium"
        >
          <span className="truncate">{item.title}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function TopLink({ item, badge = 0 }: { item: Item & { icon: any }; badge?: number }) {
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
          <Count n={badge} />
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
  const { isAdmin: authIsAdmin } = useAuth();
  const { isPreviewActive: previewActive } = usePreviewMode();
  const supplierDirectoryInSettings = true;
  const purchasingActive = pathname.startsWith("/procurement/") && !stockMenuActive && !(supplierDirectoryInSettings && isSupplierDirectoryRoute(pathname));
  const purchasingChildren = [...purchasingSectionPages, ...(supplierDirectoryInSettings ? [] : [SUPPLIER_DIRECTORY_TAB])].filter(purchasingAccess.canOpen);
  const stockMenuChildren = stockMenuSectionPages.filter(purchasingAccess.canOpen);
  const purchasingChildActive = (url: string) => matchesPurchasingPath(purchasingParentPath(pathname), url);
  const revenueDestination = revenueLanding(revenueAccess.sidebarRevenue, revenueAccess.sidebarForecast);
  const revenueActive = isRevenueRoute(pathname) && revenueSection(pathname) !== "setup";
  const { user, isAdmin, signOut } = useAuth();
  const { previewUserId, isPreviewActive } = usePreviewMode();
  const { isPlatformAdmin } = usePlatformAdmin();
  const { activeTenantId, isInsideClient, exitToPlatform } = useTenantSession();
  const [clientName, setClientName] = useState("");
  const expenseNav = visibleExpenseTabs(useExpenseClaimsExist());

  const effectiveUserId = isPreviewActive && isAdmin ? previewUserId : user?.id;
  const { showInSidebar, canAccessPage, loading: permissionsLoading } = useUserPermissions(effectiveUserId || undefined);
  const team = useTeamOpenCounts();
  const [sp] = useSearchParams();
  const [accountOpen, setAccountOpen] = useState(false);
  const { memberships } = useActiveTenant();
  const myRole = roleWords(memberships.find((m) => m.tenant_id === activeTenantId)?.role ?? (isPlatformAdmin ? "platform_admin" : undefined));
  const nameQ = useQuery({
    queryKey: ["sidebar", "name", user?.id], enabled: !!user?.id, staleTime: 600000,
    queryFn: async () => (await supabase.from("profiles").select("display_name").eq("user_id", user!.id).maybeSingle()).data?.display_name ?? "",
  });
  const myName = nameQ.data || (user?.user_metadata as any)?.full_name || user?.email?.split("@")[0] || "";

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
  const revSection = revenueSection(pathname);
  const revenueChildren = [
    { key: "overview", title: "Overview", to: "/revenue", allowed: revenueAccess.revenue },
    { key: "sales", title: "Sales records", to: "/sales-data", allowed: revenueAccess.revenue },
    { key: "analysis", title: "Trends", to: "/revenue/analysis", allowed: revenueAccess.revenue },
    { key: "targets", title: "Targets", to: "/revenue/targets-new", allowed: revenueAccess.forecast },
  ].filter((c) => c.allowed);
  const peopleSettings=usePeopleSettings();const peopleScope=useVenueScope();
  const peopleChildren = [
    { title: "Overview", to: "/hr/overview" }, { title: "Team", to: "/hr/employees" }, { title: "Rota", to: "/hr/schedule" }, { title: "Payroll", to: "/hr/payroll" },
  ];
  const peopleActivePath = peopleNavigationPath(pathname);
  const settingsAdmin = isAdmin && !isPreviewActive;
  const sTab = sp.get("tab") ?? (settingsAdmin ? "business" : "master-data"), sView = sp.get("view");
  const settingsChildren = [
    { title: "Business", to: "/settings?tab=business", active: sTab === "business", admin: true },
    { title: "Users", to: "/settings?tab=users", active: sTab === "users" && sView !== "activity", admin: true },
    { title: "Activity", to: "/settings?tab=users&view=activity", active: sTab === "users" && sView === "activity", admin: true },
    { title: "Accounting", to: "/settings?tab=accounting", active: sTab === "accounting", admin: true },
    { title: "Master data", to: "/settings?tab=master-data", active: sTab === "master-data", admin: false },
    { title: "Bani", to: "/settings?tab=bani", active: sTab === "bani", admin: true },
  ].filter((c) => (c.admin ? settingsAdmin : settingsAdmin || canAccessPage("invoices")));
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
    return !!item.pageKey && showInSidebar(item.pageKey) && canAccessPage(item.pageKey);
  });

  const canSeeSection = (pageKey: string): boolean => {
    if (isPlatformAdmin) return true;
    if (isAdmin && !isPreviewActive) return true;
    return showInSidebar(pageKey) && canAccessPage(pageKey);
  };

  const showFinance     = canSeeSection("finance");
  const showProcurement = canSeeSection("procurement");
  const showHR          = canSeeSection("people");
  const showBank        = canSeeSection("bank");
  const showPayments    = canSeeSection("payments");
  const showPettyCash   = canSeeSection("pettycash");
  const showAdmin       = isAdmin && !isPreviewActive;
  const showSettings = showAdmin || purchasingAccess.canOpen(SUPPLIER_DIRECTORY_TAB);
  // "Bani team" = the sum of the section counts this person can see (waiting items only).
  const homeBadge = (revenueDestination ? team.counts.revenue : 0) + (showProcurement ? team.counts.purchasing : 0) + (showHR ? team.counts.people : 0) + (showFinance ? team.counts.finance : 0);
  const goPages = [
    { title: "Bani team", to: "/" },
    ...(revenueDestination ? revenueChildren.map((c) => ({ title: `Revenue · ${c.title}`, to: c.to })) : []),
    ...(showProcurement ? purchasingChildren.map((c) => ({ title: `Purchasing · ${c.title}`, to: c.url })) : []),
    ...(showProcurement ? stockMenuChildren.map((c) => ({ title: `Stock & menu · ${c.title}`, to: c.url })) : []),
    ...(showHR ? peopleChildren.map((c) => ({ title: `People · ${c.title}`, to: c.to })) : []),
    ...(showFinance ? expenseNav.map((t) => ({ title: `Expenses · ${t.label}`, to: t.path })) : []),
    ...(showFinance ? financeTabs.map((t) => ({ title: `Finance · ${t.label}`, to: t.path })) : []),
    ...(showSettings ? settingsChildren.map((c) => ({ title: `Settings · ${c.title}`, to: c.to })) : []),
  ];
  const me = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed
          ? <button type="button" className="bani-me inline-flex h-[38px] w-[38px] items-center justify-center rounded-full" aria-label="Your account and sign out"><span className="bani-me-initials">{initialsOf(myName || user?.email || "") || "?"}</span></button>
          : <button type="button" className="bani-me flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left" aria-label="Your account and sign out">
              <span className="bani-me-initials">{initialsOf(myName || user?.email || "") || "?"}</span>
              <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{myName}</span>{myRole && <span className="block text-[11.5px] bani-me-role">{myRole}</span>}</span>
            </button>}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={collapsed ? "right" : "top"} align={collapsed ? "end" : "start"} className="w-52">
        <DropdownMenuItem className="gap-2.5" onSelect={() => setAccountOpen(true)}><UserRound className="h-4 w-4" />Your account</DropdownMenuItem>
        <DropdownMenuItem className="gap-2.5" onSelect={signOut}><LogOut className="h-4 w-4" />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <Sidebar variant="sidebar" collapsible="icon" className="bani-side">
      {collapsed ? (
        <div className={cn(isPreviewActive && "mt-10")} />
      ) : (
      <div className={cn("pb-3 space-y-2.5", isPreviewActive && "mt-10")}>
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
        <GoToPage pages={goPages} />
      </div>
      )}

      {collapsed ? (
        <CollapsedRail onExpand={() => setOpen(true)} footer={me} items={[
          ...visibleItems.map((it) => ({ title: it.title, to: it.url, icon: it.icon, active: it.end ? pathname === it.url : pathname === it.url || pathname.startsWith(it.url + "/"), dot: it.url === "/" && homeBadge > 0 })),
          ...(revenueDestination ? [{ title: "Revenue", to: revenueDestination, icon: TrendingUp, active: revenueActive, dot: team.counts.revenue > 0 }] : []),
          ...(showProcurement ? [
            { title: "Purchasing", to: "/procurement/dashboard", icon: ShoppingCart, active: purchasingActive, dot: team.counts.purchasing > 0 },
            { title: "Stock & menu", to: "/procurement/inventory", icon: Package, active: stockMenuActive },
          ] : []),
          ...(showHR ? [{ title: "People", to: "/hr", icon: Users, active: pathname === "/hr" || pathname.startsWith("/hr/"), dot: team.counts.people > 0 }] : []),
          ...(showFinance ? [{ title: "Expenses", to: "/expenses", icon: ReceiptText, active: pathname.startsWith("/expenses") }] : []),
          ...(showFinance ? [{ title: "Finance", to: "/finance", icon: Scale, active: pathname === "/finance" || pathname.startsWith("/finance/") || pathname === "/pl-report", dot: team.counts.finance > 0 }] : []),

          ...(showSettings ? [{ title: "Settings", to: showAdmin ? "/settings" : "/settings?tab=master-data", icon: Settings, active: pathname === "/settings" }] : []),
        ]} />
      ) : (
      <SidebarContent className="py-2 gap-3">
        {/* Top-level items, no group label */}
        <SidebarGroup className="py-0 px-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {visibleItems.map((it) => <TopLink key={it.url} item={it} badge={it.url === "/" ? homeBadge : 0} />)}
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
                    <TrendingUp className="h-4 w-4 shrink-0" /><span>Revenue</span><Count n={team.counts.revenue} />
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
                    <ShoppingCart className="h-4 w-4 shrink-0" /><span>Purchasing</span><Count n={team.counts.purchasing} />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {showSubPages && purchasingActive && purchasingChildren.map((item) => <FlagChildLink key={item.url} title={item.title} to={item.url} active={purchasingChildActive(item.url)} />)}
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

        {showHR && (
          <SidebarGroup className="py-0 px-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="p-0 h-auto hover:bg-transparent active:bg-transparent data-[active=true]:bg-transparent">
                  <Link to={pathname === "/hr" ? pathname + search : "/hr"} aria-current={pathname === "/hr" || pathname.startsWith("/hr/") ? "page" : undefined}
                    className={cn("relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors", (pathname === "/hr" || pathname.startsWith("/hr/")) && "glass-active !text-sidebar-primary font-medium")}>
                    <Users className="h-4 w-4 shrink-0" /><span>People</span><Count n={team.counts.people} />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {showSubPages && (pathname === "/hr" || pathname.startsWith("/hr/")) && peopleChildren.map((c) => <FlagChildLink key={c.to} title={c.title} to={c.to} active={peopleActivePath === c.to} />)}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {showFinance && <SidebarGroup className="py-0 px-2"><SidebarMenu><TopLink item={{title:"Expenses",url:"/expenses",icon:ReceiptText}} />{showSubPages && pathname.startsWith("/expenses") && expenseNav.map(t=><FlagChildLink key={t.path} title={t.label} to={t.path} active={t.path===pathname}/>)}</SidebarMenu></SidebarGroup>}



        {showFinance && <SidebarGroup className="py-0 px-2"><SidebarMenu><TopLink item={{title:"Finance",url:"/finance",icon:Scale}} badge={team.counts.finance} />{showSubPages && (pathname === "/finance" || pathname.startsWith("/finance/")) && financeTabs.map(t=><FlagChildLink key={t.path} title={t.label} to={t.path} active={t.path===pathname}/>)}</SidebarMenu></SidebarGroup>}

        {(showAdmin || purchasingAccess.canOpen(SUPPLIER_DIRECTORY_TAB)) && <SidebarGroup className="py-0 px-2"><SidebarMenu><TopLink item={{title:"Settings",url:showAdmin?"/settings":"/settings?tab=master-data",icon:Settings}} />{pathname === "/settings" && settingsChildren.map(c=><FlagChildLink key={c.to} title={c.title} to={c.to} active={c.active}/>)}</SidebarMenu></SidebarGroup>}


      </SidebarContent>
      )}

      {!collapsed && <SidebarFooter className="border-t border-sidebar-border p-2">{me}</SidebarFooter>}
      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} name={myName} email={user?.email ?? ""} onSignOut={() => { setAccountOpen(false); void signOut(); }} />
    </Sidebar>
  );
}

