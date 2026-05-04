import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { UserMenu } from "@/components/UserMenu";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { isPreviewActive } = usePreviewMode();
  
  return (
    <SidebarProvider>
      <div className={`min-h-screen flex w-full ${isPreviewActive ? "pt-10" : ""}`}>
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="h-12 flex items-center justify-between border-b border-border px-4 bg-background">
            <SidebarTrigger />
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
