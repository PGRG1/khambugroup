import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Building2, PanelLeft } from "lucide-react";
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
                ? "bg-sage/10 text-bone dark:glass-active dark:text-white"
                : "text-bone/75 hover:bg-bone/5 hover:text-bone dark:text-muted-foreground dark:hover:bg-foreground/[0.05] dark:hover:text-foreground"
            }`}
          >
            <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-sage dark:text-white" : ""}`} />
            {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}

function Branding({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div
      className={`flex items-center h-16 shrink-0 ${
        collapsed ? "justify-center px-0" : "gap-3 px-5"
      }`}
    >
      <BaniLoginMark className="h-6 w-[13px] shrink-0 text-bone dark:text-white" />
      {!collapsed && (
        <span className="font-geist font-light tracking-tight text-[15px] whitespace-nowrap text-bone dark:text-white">
          Bani Platform
        </span>
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
        className={`hidden lg:flex shrink-0 flex-col overflow-hidden border-r border-border/60 dark:border-white/[0.06] bg-sidebar transition-[width] duration-300 ease-out ${
          collapsed ? "w-[60px]" : "w-[220px]"
        }`}
      >
        <Branding collapsed={collapsed} />
        <div className="pt-2">
          <NavBody active={active} collapsed={collapsed} />
        </div>
      </aside>

      {/* Off-canvas drawer for < lg */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="platform-shell p-0 bg-sidebar border-r border-border/60 dark:border-white/[0.06] w-[min(280px,calc(100vw-48px))] sm:max-w-none"
        >
          <Branding />
          <div className="pt-2">
            <NavBody active={active} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <main className="platform-main flex-1 flex flex-col min-w-0">
        <header className="platform-topbar h-14 flex items-center justify-between gap-3 border-b border-border px-4 sm:px-7 bg-background dark:bg-transparent dark:border-white/[0.055]">
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
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex h-9 w-9 shrink-0"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              aria-expanded={!collapsed}
            >
              <PanelLeft className="h-4.5 w-4.5" />
            </Button>
            <span className="hidden sm:inline font-plex text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate">
              Platform control plane
            </span>
          </div>
          <UserMenu />
        </header>
        <div className="flex-1 w-full max-w-[1420px] mx-auto px-4 sm:px-7 lg:px-10 pt-10 sm:pt-12 lg:pt-16 pb-10">
          {children}
        </div>
      </main>
    </div>
  );
}
