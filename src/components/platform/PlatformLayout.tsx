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
    <SidebarProvider>
      <div className="platform-shell min-h-screen flex w-full bg-background text-foreground">
        <Sidebar collapsible="icon" className="dark:border-r dark:border-sidebar-border">
          <SidebarHeader className="px-3 py-4">
            <div className="flex items-center gap-2.5 text-sm">
              <BaniLoginMark className="h-5 w-[11px] shrink-0 text-sidebar-foreground dark:text-white" />
              <span className="font-geist font-light tracking-tight text-[15px] text-sidebar-foreground dark:text-white">
                Bani Platform
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={clientsActive}
                      className={
                        clientsActive
                          ? "dark:bg-white/[0.07] dark:border dark:border-white/10 dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                          : "dark:text-sidebar-foreground/65 dark:hover:bg-white/[0.04] dark:hover:text-white"
                      }
                    >
                      <NavLink to="/platform/clients" className="flex items-center gap-2">
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
          <header className="h-12 flex items-center justify-between border-b border-border px-4 bg-background dark:bg-transparent dark:border-white/[0.07]">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <span className="font-plex text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Platform control plane
              </span>
            </div>
            <UserMenu />
          </header>
          <div className="flex-1 w-full max-w-[1440px] mx-auto px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

