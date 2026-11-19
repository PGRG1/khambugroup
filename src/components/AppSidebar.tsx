import { resolveSettingsDestination, settingsDestinations, settingsGroups, settingsHref } from "@/utils/settingsNavigation";
import { TenantSwitcher } from "@/components/TenantSwitcher";
import { useTeamOpenCounts } from "@/hooks/useTeamOpenCounts";
import { PushNotificationsRow } from "@/components/UserMenu";
import {
  LogOut, Users, UserRound, Search,
  TrendingUp, Scale, ChevronDown,
  ShoppingCart, ReceiptText, Landmark, CreditCard, Coins,
  Settings, HandCoins, ArrowLeft, ChevronsLeft, ChevronsRight, Package,
} from "lucide-react";

import { BaniOrb } from "@/components/assistant/BaniOrb";
import { NavLink } from "@/components/NavLink";
import { useFloatingBaniOpen } from "@/components/assistant/FloatingBaniContext";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useTenantSession } from "@/hooks/useTenantSession";
import { supabase } from "@/integrations/supabase/client";

import React, { useEffect, useState , useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useNavigate } from "react-router-dom";
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router-dom";
import { useRevenueNavigationAccess } from "@/hooks/useRevenueNavigationAccess";
import { isRevenueRoute, revenueLanding, revenueSection } from "@/utils/revenueNavigation";

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
import { MobileTabBar } from "@/components/MobileTabBar";
import { createPortal } from "react-dom";
import { SUPPLIER_DIRECTORY_TAB, isSupplierDirectoryRoute, isStockMenuRoute, matchesPurchasingPath, purchasingParentPath, purchasingSectionPages, stockMenuSectionPages } from "@/utils/purchasingNavigation";
import { usePurchasingNavigationAccess } from "@/hooks/usePurchasingNavigationAccess";

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

/** The Bani team icon: the same orb as the chat sphere, at icon size. */
function HomeOrb({ className }: { className?: string }) {
  return <BaniOrb size={className?.includes("18px") ? 22 : 20} mode="idle" className={cn("shrink-0 -m-0.5", className)} />;
}
const roleWords = (r?: string) => (!r ? "" : ["tenant_admin", "platform_admin", "super_admin", "owner", "admin"].includes(r) ? "Owner" : r === "manager" ? "Manager" : "Team");

type RailChild = { title: string; to: string; active?: boolean };
type RailItem = { title: string; to: string; icon: any; active: boolean; dot?: boolean; children?: RailChild[] };

/** One menu row, the same in both states: icon, name, count. Collapsed hides the name and shows the count as a dot,
 *  with the name (and count) on hover. */
function MenuTip({ label, show = true, children }: { label: string; show?: boolean; children: React.ReactNode }) {
  if (!show) return <>{children}</>;
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipPortal><TooltipContent side="right" sideOffset={10} className="bani-rail-tip z-[70]">{label}</TooltipContent></TooltipPortal></Tooltip>;
}
function MenuRow({ it, count = 0, collapsed, onClick }: { it: RailItem; count?: number; collapsed: boolean; onClick?: () => void }) {
  const Icon = it.icon;
  return <MenuTip show={collapsed} label={count ? `${it.title} · ${count} need${count === 1 ? "s" : ""} you` : it.title}>
    <Link to={it.to} onClick={onClick} aria-label={collapsed ? it.title : undefined} aria-current={it.active ? "page" : undefined} className={cn("bani-row", collapsed && "is-icon", it.active && "is-active")}>
      <span className="relative inline-flex"><Icon className="bani-row-icon h-[18px] w-[18px]" strokeWidth={it.active ? 2.2 : 1.8} />{collapsed && count > 0 && <span className="bani-dot" aria-hidden="true" />}</span>
      {!collapsed && <span className="min-w-0 flex-1 truncate">{it.title}</span>}
      {!collapsed && count > 0 && <span className="bani-count">{count}</span>}
    </Link>
  </MenuTip>;
}

/** Navigation-only page finder (⌘K). Never sends anything to Bani. */
function GoToPage({ pages, open: openProp, onOpenChange, button = true, icon = false }: { pages: { title: string; to: string }[]; open?: boolean; onOpenChange?: (o: boolean) => void; button?: boolean; icon?: boolean }) {
  const [openSelf, setOpenSelf] = useState(false);
  const open = openProp ?? openSelf;
  const setOpen = (o: boolean | ((p: boolean) => boolean)) => { const v = typeof o === "function" ? o(open) : o; setOpenSelf(v); onOpenChange?.(v); };
  const navigate = useNavigate();
  const toggle = useRef(() => {});
  toggle.current = () => setOpen(!open);
  useEffect(() => {
    if (!button) return;
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); toggle.current(); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [button]);
  return <>
    {button && (icon
      ? <MenuTip label="Go to a page · ⌘K"><button type="button" onClick={() => setOpen(true)} aria-label="Go to a page" className="bani-row is-icon"><Search className="bani-row-icon" /></button></MenuTip>
      : <button type="button" onClick={() => setOpen(true)} aria-label="Go to a page" className="bani-goto bani-row"><Search className="bani-row-icon" /><span className="flex-1 text-left">Go to a page</span><kbd className="text-[11px]">⌘K</kbd></button>)}
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
  const [sp] = useSearchParams();
  const [accountOpen, setAccountOpen] = useState(false);
  const { memberships } = useActiveTenant();
  const myRole = roleWords(memberships.find((m) => m.tenant_id === activeTenantId)?.role ?? (isPlatformAdmin ? "platform_admin" : undefined));
  const nameQ = useQuery({
    queryKey: ["sidebar", "name", user?.id], enabled: !!user?.id, staleTime: 600000,
    queryFn: async () => (await supabase.from("profiles").select("display_name").eq("user_id", user!.id).maybeSingle()).data?.display_name ?? "",
  });
  // Wait for the profile before falling back, so the email part never flashes before the real name.
  const myName = nameQ.isPending ? "" : nameQ.data || (user?.user_metadata as any)?.full_name || user?.email?.split("@")[0] || "";

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
  const settingsHere = pathname === "/settings" ? resolveSettingsDestination(sp) : "denied";
  const settingsGroupOf = settingsDestinations.find((d) => d.id === settingsHere)?.group;
  const settingsChildren = [
    { title: "All settings", to: "/settings", active: settingsHere === "overview", admin: false },
    ...settingsGroups.map((g) => { const first = settingsDestinations.find((d) => d.group === g)!; return { title: g, to: settingsHref(first.id), active: settingsGroupOf === g, admin: g !== "Lists" }; }),
  ].filter((c) => (c.admin ? settingsAdmin : settingsAdmin || canAccessPage("invoices")));

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
        <TenantSwitcher />
        <PushNotificationsRow />
        <DropdownMenuItem className="gap-2.5" onSelect={() => setAccountOpen(true)}><UserRound className="h-4 w-4" />Your account</DropdownMenuItem>
        <DropdownMenuItem className="gap-2.5" onSelect={signOut}><LogOut className="h-4 w-4" />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const railItems: RailItem[] = [
          ...visibleItems.map((it) => ({ title: it.title, to: it.url, icon: it.icon, active: it.end ? pathname === it.url : pathname === it.url || pathname.startsWith(it.url + "/") })),
          ...(revenueDestination ? [{ title: "Revenue", to: revenueDestination, icon: TrendingUp, active: revenueActive, children: revenueChildren.map((c) => ({ title: c.title, to: c.to, active: revenueActive && revSection === c.key })) }] : []),
          ...(showProcurement ? [
            { title: "Purchasing", to: "/procurement/dashboard", icon: ShoppingCart, active: purchasingActive, children: purchasingChildren.map((c) => ({ title: c.title, to: c.url, active: purchasingActive && purchasingChildActive(c.url) })) },
            { title: "Stock & menu", to: "/procurement/stock-overview", icon: Package, active: stockMenuActive, children: stockMenuChildren.map((c) => ({ title: c.title, to: c.url, active: stockMenuActive && purchasingChildActive(c.url) })) },
          ] : []),
          ...(showHR ? [{ title: "People", to: "/hr", icon: Users, active: pathname === "/hr" || pathname.startsWith("/hr/"), children: peopleChildren.map((c) => ({ title: c.title, to: c.to, active: peopleActivePath === c.to })) }] : []),
          ...(showFinance ? [{ title: "Expenses", to: "/expenses", icon: ReceiptText, active: pathname.startsWith("/expenses"), children: expenseNav.map((t) => ({ title: t.label, to: t.path, active: t.path === pathname })) }] : []),
          ...(showFinance ? [{ title: "Finance", to: "/finance", icon: Scale, active: pathname === "/finance" || pathname.startsWith("/finance/") || pathname === "/pl-report", children: financeTabs.map((t) => ({ title: t.label, to: t.path, active: t.path === pathname })) }] : []),

          ...(showSettings ? [{ title: "Settings", to: showAdmin ? "/settings" : "/settings?tab=master-data", icon: Settings, active: pathname === "/settings" }] : []),
        ];

  const teamCounts = useTeamOpenCounts().counts;
  const sectionCount = (title: string) => title === "Revenue" ? teamCounts.revenue : title === "Purchasing" ? teamCounts.purchasing : title === "People" ? teamCounts.people : title === "Finance" ? teamCounts.finance : 0;
  const [, setBaniOpen] = useFloatingBaniOpen();
  // Phone: sections along the bottom (Bani team pinned), account behind the initials in the top bar.
  const [mobileAccount, setMobileAccount] = useState(false);
  const [goOpen, setGoOpen] = useState(false);
  const [accountSlot, setAccountSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setAccountSlot(isMobile ? document.getElementById("mobile-account-slot") : null); }, [isMobile]);
  const homeItem = railItems.find((it) => it.to === "/");
  const tabItems = railItems.filter((it) => it.to !== "/").map((it) => ({ title: it.title, to: it.to, icon: it.icon, active: it.active }));
  const initials = initialsOf(myName || user?.email || "") || "?";
  const mobile = isMobile && (
    <>
      {homeItem && <MobileTabBar home={{ title: homeItem.title, to: "/", icon: HomeOrb, active: homeItem.active }} items={tabItems} />}
      {accountSlot && createPortal(
        <button type="button" onClick={() => setMobileAccount(true)} className="mobile-me" aria-label="Your account, sign out and more"><span className="bani-me-initials">{initials}</span></button>,
        accountSlot,
      )}
      <Dialog open={mobileAccount} onOpenChange={setMobileAccount}>
        <DialogContent className="mobile-account max-w-[360px] gap-3 rounded-2xl p-4">
          <DialogHeader className="sr-only"><DialogTitle>Your account</DialogTitle></DialogHeader>
          <div className="flex items-center gap-3 px-1 pt-1">
            <span className="bani-me-initials !h-10 !w-10">{initials}</span>
            <span className="min-w-0"><span className="block truncate text-[15px] font-medium">{myName}</span>
              <span className="block truncate text-[13px] bani-me-role">{[myRole, clientName].filter(Boolean).join(" · ")}</span></span>
          </div>
          <TenantSwitcher />
          <div className="mobile-account-list">
            <button type="button" onClick={() => { setMobileAccount(false); setGoOpen(true); }}><Search className="h-[18px] w-[18px]" />Go to a page</button>
            <button type="button" onClick={() => { setMobileAccount(false); setAccountOpen(true); }}><UserRound className="h-[18px] w-[18px]" />Your account</button>
            {isPlatformAdmin && isInsideClient && <button type="button" onClick={() => { setMobileAccount(false); exitToPlatform(); }}><ArrowLeft className="h-[18px] w-[18px]" />Exit to Platform</button>}
            <button type="button" onClick={() => { setMobileAccount(false); void signOut(); }}><LogOut className="h-[18px] w-[18px]" />Sign out</button>
          </div>
          <PushNotificationsRow />
        </DialogContent>
      </Dialog>
      <GoToPage pages={goPages} open={goOpen} onOpenChange={setGoOpen} button={false} />
    </>
  );

  return (<>
    {mobile}
    <Sidebar variant="sidebar" collapsible="icon" className="bani-side">
      <div className={cn("bani-menu", collapsed && "is-collapsed", isPreviewActive && "mt-10")}>
        <div className="bani-menu-head">
          <BaniLoginMark className="bani-brand-mark h-[26px] w-[16px] shrink-0" />
          {!collapsed && <span className="bani-brand-word font-light tracking-tight leading-none">Bani</span>}
          {!collapsed && !isMobile && <button type="button" onClick={() => setOpen(false)} aria-label="Collapse sidebar" className="bani-collapse-btn ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md"><ChevronsLeft className="h-4 w-4" /></button>}
        </div>
        {clientName && (() => {
          const switchable = isPlatformAdmin && isInsideClient;
          const box = <button type="button" className={cn("bani-client", collapsed && "is-icon")} aria-label={collapsed ? clientName : undefined}>
            <span className="bani-client-mark">{initialsOf(clientName)}</span>
            {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{clientName}</span>}
            {!collapsed && <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />}
          </button>;
          return <DropdownMenu>
            <MenuTip show={collapsed} label={clientName}><DropdownMenuTrigger asChild>{box}</DropdownMenuTrigger></MenuTip>
            <DropdownMenuContent side={collapsed ? "right" : "bottom"} align="start" className="w-56">
              <div className="px-2 py-1.5 text-[12px] font-semibold">{clientName}</div>
              <TenantSwitcher />
              {switchable && <DropdownMenuItem className="gap-2.5" onSelect={exitToPlatform}><ArrowLeft className="h-4 w-4" />Exit to Platform</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>;
        })()}
        <GoToPage pages={goPages} open={goOpen} onOpenChange={setGoOpen} icon={collapsed} />
        <div className="bani-menu-line" />
        {railItems.filter((it) => it.to === "/").map((it) => <MenuRow key={it.to} it={it} collapsed={collapsed} onClick={() => setBaniOpen(false)} />)}
        <div className="bani-menu-line" />
        <nav aria-label="Sections" className="bani-menu-list">
          {railItems.filter((it) => it.to !== "/").map((it) => <MenuRow key={it.title} it={it} collapsed={collapsed} count={sectionCount(it.title)} />)}
        </nav>
        <div className="bani-menu-foot">
          {collapsed && <MenuTip label="Expand sidebar"><button type="button" onClick={() => setOpen(true)} aria-label="Expand sidebar" className="bani-row is-icon"><ChevronsRight className="bani-row-icon h-4 w-4" /></button></MenuTip>}
          {me}
        </div>
      </div>
    </Sidebar>
    {/* Outside the menu so it also opens on a phone, where the side menu is never shown. */}
    <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} name={myName} email={user?.email ?? ""} onSignOut={() => { setAccountOpen(false); void signOut(); }} />
  </>);
}

