import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Building2, PanelLeft, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/UserMenu";
import { BaniLoginMark } from "@/components/brand/BaniLoginMark";

const NAV = [{ to: "/platform/clients", label: "Clients", icon: Building2 }];

const STORAGE_KEY = "bani.platform.sidebar.collapsed";

function NavBody({
  onNavigate,
  active,
  collapsed = false,
}: {
  onNavigate?: () => void;
  active: (p: string) => boolean;
  collapsed?: boolean;
}) {
  return (
    <nav className={`flex flex-col gap-1 ${collapsed ? "px-2" : "px-3"}`}>
      {NAV.map((item) => {
        const isActive = active(item.to);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            aria-label={item.label}
            className={`flex items-center gap-2.5 rounded-lg h-10 text-sm transition-colors ${
              collapsed ? "justify-center px-0" : "px-3"
            } ${
              isActive
                ? "bg-[#E9F1EC] text-[#1F3F3B] font-semibold dark:font-normal dark:bg-transparent dark:glass-active dark:text-white"
                : "text-[#3D4842] hover:bg-[rgba(20,45,43,0.06)] hover:text-[#1F3F3B] dark:text-muted-foreground dark:hover:bg-foreground/[0.05] dark:hover:text-foreground"
            }`}
          >
            <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-[#1F3F3B] dark:text-white" : ""}`} />
            {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}

function Branding({
  collapsed = false,
  onCollapse,
  onExpand,
}: {
  collapsed?: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
}) {
  if (collapsed) {
    return (
      <div className="bani-rail-head flex items-center justify-center h-16 shrink-0 border-b border-[rgba(31,63,59,0.12)] dark:border-transparent">
        <button
          type="button"
          onClick={onExpand}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          className="bani-rail-expand bani-rail-logo inline-flex h-[34px] w-[34px] items-center justify-center rounded-[8px] text-[#25372B] dark:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <BaniLoginMark className="bani-rail-mark h-[26px] w-[16px]" />
          <ChevronsRight className="bani-rail-chev h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="bani-sidebar-head flex items-center gap-2 h-16 shrink-0 px-4 border-b border-[rgba(31,63,59,0.12)] dark:border-transparent">
      <BaniLoginMark className="bani-brand-mark h-[30px] w-[18px] shrink-0 dark:text-white" />
      <span className="bani-brand-word font-light tracking-tight leading-none whitespace-nowrap dark:text-white">Bani Platform</span>
      {onCollapse && (
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          className="bani-collapse-btn ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Platform control-plane shell. Completely separate from AppLayout — no
 * tenant sidebar, no tenant-scoped hooks. Persistent (collapsible) sidebar at
 * lg+, off-canvas drawer below lg.
 */
export function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
  });
  const active = (p: string) => pathname === p || pathname.startsWith(p + "/");

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [collapsed]);

  return (
    <div className="platform-shell min-h-screen flex w-full bg-background text-foreground">
      {/* Persistent desktop sidebar */}
      <aside
        className={`hidden lg:flex shrink-0 flex-col overflow-hidden border-r border-[rgba(31,63,59,0.12)] dark:border-white/[0.06] bg-white dark:bg-sidebar transition-[width] duration-300 ease-out ${
          collapsed ? "w-[60px]" : "w-[240px]"
        }`}
      >
        <Branding collapsed={collapsed} onCollapse={() => setCollapsed(true)} onExpand={() => setCollapsed(false)} />
        <div className="pt-4">
          <NavBody active={active} collapsed={collapsed} />
        </div>
      </aside>

      {/* Off-canvas drawer for < lg */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="platform-shell p-0 bg-white dark:bg-sidebar border-r border-[rgba(31,63,59,0.12)] dark:border-white/[0.06] w-[min(280px,calc(100vw-48px))] sm:max-w-none"
        >
          <Branding />
          <div className="pt-2">
            <NavBody active={active} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <main className="platform-main flex-1 flex flex-col min-w-0">
        <header className="platform-topbar h-16 flex items-center justify-between gap-3 border-b border-[rgba(31,63,59,0.12)] px-4 sm:px-7 bg-[rgba(245,244,240,0.85)] dark:bg-transparent dark:border-white/[0.055]">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <PanelLeft className="h-4.5 w-4.5" />
            </Button>
            <span className="hidden sm:inline font-plex text-[11px] uppercase tracking-[0.16em] text-muted-foreground truncate">
              Platform control plane
            </span>
          </div>
          <UserMenu />
        </header>
        <div className="flex-1 w-full max-w-[1240px] mx-auto px-4 sm:px-7 lg:px-8 pt-8 sm:pt-10 pb-10">
          {children}
        </div>
      </main>
    </div>
  );
}
