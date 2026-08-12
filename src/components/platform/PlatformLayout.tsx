import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Building2, Menu } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/UserMenu";
import { BaniLoginMark } from "@/components/brand/BaniLoginMark";

const NAV = [{ to: "/platform/clients", label: "Clients", icon: Building2 }];

function NavBody({ onNavigate, active }: { onNavigate?: () => void; active: (p: string) => boolean }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.map((item) => {
        const isActive = active(item.to);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 rounded-lg px-3 h-10 text-sm transition-colors ${
              isActive
                ? "bg-primary/[0.10] border border-primary/20 text-foreground dark:text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
                : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function Branding() {
  return (
    <div className="flex items-center gap-3 px-5 h-16 shrink-0">
      <BaniLoginMark className="h-6 w-[13px] shrink-0 text-sidebar-foreground dark:text-white" />
      <span className="font-geist font-light tracking-tight text-[15px] whitespace-nowrap text-sidebar-foreground dark:text-white">
        Bani Platform
      </span>
    </div>
  );
}

/**
 * Platform control-plane shell. Completely separate from AppLayout — no
 * tenant sidebar, no tenant-scoped hooks. Persistent sidebar at lg+, off-canvas
 * drawer below lg.
 */
export function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const active = (p: string) => pathname === p || pathname.startsWith(p + "/");

  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <div className="platform-shell min-h-screen flex w-full bg-background text-foreground">
      {/* Persistent desktop sidebar */}
      <aside className="hidden lg:flex w-[220px] shrink-0 flex-col border-r border-border/60 dark:border-white/[0.06] bg-sidebar">
        <Branding />
        <div className="pt-2">
          <NavBody active={active} />
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

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center justify-between gap-3 border-b border-border px-4 sm:px-7 bg-background dark:bg-transparent dark:border-white/[0.055]">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-9 w-9 shrink-0"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-4.5 w-4.5" />
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
