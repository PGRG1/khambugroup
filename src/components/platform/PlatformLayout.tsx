import { NavLink, useLocation } from "react-router-dom";
import { Building2, Sparkles } from "lucide-react";
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

/**
 * Platform control-plane shell. Completely separate from AppLayout — no
 * tenant sidebar, no tenant-scoped hooks. Only platform-level navigation and
 * pages render inside this shell.
 */
export function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const active = (p: string) => pathname === p || pathname.startsWith(p + "/");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <Sidebar collapsible="icon">
          <SidebarHeader className="px-3 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Bani Platform</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={active("/platform/clients")}>
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
        <main className="flex-1 flex flex-col">
          <header className="h-12 flex items-center justify-between border-b border-border px-4 bg-background">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Platform control plane
              </span>
            </div>
            <UserMenu />
          </header>
          <div className="flex-1 w-full max-w-[1800px] mx-auto p-3 sm:p-6 lg:p-8 2xl:px-12">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
