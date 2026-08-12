import { NavLink, useLocation } from "react-router-dom";
import { Building2 } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { UserMenu } from "@/components/UserMenu";
import { BaniLoginMark } from "@/components/brand/BaniLoginMark";

/**
 * Platform control-plane shell. Completely separate from AppLayout — no
 * tenant sidebar, no tenant-scoped hooks. Only platform-level navigation and
 * pages render inside this shell.
 */
export function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const active = (p: string) => pathname === p || pathname.startsWith(p + "/");
  const clientsActive = active("/platform/clients");

  return (
    <SidebarProvider style={{ "--sidebar-width": "216px" } as React.CSSProperties}>
      <div className="platform-shell min-h-screen flex w-full bg-background text-foreground">
        <Sidebar collapsible="icon" className="border-r border-border/60 dark:border-white/[0.06]">
          <SidebarHeader className="px-4 pt-6 pb-5">
            <div className="flex items-center gap-3 text-sm">
              <BaniLoginMark className="h-6 w-[13px] shrink-0 text-sidebar-foreground dark:text-white" />
              <span className="font-geist font-light tracking-tight text-[15px] text-sidebar-foreground dark:text-white">
                Bani Platform
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent className="px-1.5">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={clientsActive}
                      className={
                        clientsActive
                          ? "dark:bg-primary/[0.10] dark:border dark:border-primary/20 dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
                          : "dark:text-sidebar-foreground/60 dark:hover:bg-white/[0.035] dark:hover:text-white"
                      }
                    >
                      <NavLink to="/platform/clients" className="flex items-center gap-2.5">
                        <Building2 className="h-4 w-4" />
                        <span>Clients</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border px-5 sm:px-7 bg-background dark:bg-transparent dark:border-white/[0.055]">
            <div className="flex items-center gap-4">
              <SidebarTrigger />
              <span className="font-plex text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Platform control plane
              </span>
            </div>
            <UserMenu />
          </header>
          <div className="flex-1 w-full max-w-[1420px] mx-auto px-5 sm:px-8 lg:px-10 pt-14 pb-10 lg:pt-16">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>

  );
}

