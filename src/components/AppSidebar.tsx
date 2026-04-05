import { BarChart3, ClipboardList, LogOut, Settings, Shield, FileText, Receipt, Users, FileSpreadsheet, Package, UserCog, Calendar, DollarSign, LayoutDashboard, Building2, UtensilsCrossed, FolderDown } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";
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

const navItems = [
  { title: "Revenue", url: "/", icon: BarChart3, pageKey: "revenue" },
  { title: "Forecast vs Actual", url: "/forecast/assembly", icon: ClipboardList, pageKey: "forecast" },
  { title: "Activity Log", url: "/activity-log", icon: FileText, pageKey: "activity-log" },
  { title: "P&L Report", url: "/pl-report", icon: Receipt, pageKey: "pl-report" },
];

const procurementItems = [
  { title: "Dashboard", url: "/procurement/dashboard", icon: LayoutDashboard },
  { title: "Suppliers", url: "/procurement/suppliers", icon: Building2 },
  { title: "Products", url: "/procurement/products", icon: Package },
  { title: "Invoices", url: "/procurement/invoices", icon: FileSpreadsheet },
  { title: "Inventory", url: "/procurement/inventory", icon: ClipboardList },
  { title: "Menu Costing", url: "/procurement/menu-costing", icon: UtensilsCrossed },
  { title: "Documents", url: "/procurement/documents", icon: FolderDown },
];

export function AppSidebar() {
  const { user, isAdmin, signOut } = useAuth();
  const { previewUserId, isPreviewActive } = usePreviewMode();
  
  // Use preview user's permissions if admin is previewing
  const effectiveUserId = isPreviewActive && isAdmin ? previewUserId : user?.id;
  const { showInSidebar } = useUserPermissions(effectiveUserId || undefined);

  const visibleItems = navItems.filter(item => {
    if (isAdmin && !isPreviewActive) return true;
    return showInSidebar(item.pageKey);
  });

  const showProcurement = isAdmin && !isPreviewActive ? true : showInSidebar("invoices");

  return (
    <Sidebar className="border-r border-sidebar-border">
      <div className={`p-4 border-b border-sidebar-border ${isPreviewActive ? "mt-10" : ""}`}>
        <h1 className="text-xl font-bold font-display tracking-tight">
          <span className="text-gradient-gold">KHAMBU</span>
        </h1>
        <p className="text-[10px] text-muted-foreground mt-0.5">Analytics Dashboard</p>
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showProcurement && (
          <SidebarGroup>
            <SidebarGroupLabel>Procurement</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {procurementItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin && !isPreviewActive && (
          <SidebarGroup>
            <SidebarGroupLabel>Human Resources</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {[
                  { title: "Employee Directory", url: "/hr/employees", icon: Users },
                  { title: "Schedule", url: "/hr/schedule", icon: Calendar },
                  { title: "Leave Management", url: "/hr/leave", icon: FileText },
                  { title: "Payroll", url: "/hr/payroll", icon: DollarSign },
                ].map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin && !isPreviewActive && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/user-access"
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <UserCog className="h-4 w-4" />
                      <span>User Access</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/settings"
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <Settings className="h-4 w-4" />
                      <span>Settings</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
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
      </SidebarFooter>
    </Sidebar>
  );
}
