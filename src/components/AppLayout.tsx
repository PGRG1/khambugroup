import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useTenantSession } from "@/hooks/useTenantSession";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { UserMenu } from "@/components/UserMenu";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { isPreviewActive } = usePreviewMode();
  const topPad = isPreviewActive ? "pt-10" : "";

  return (
    <SidebarProvider>
      <div className={`min-h-screen flex w-full overflow-x-hidden ${topPad}`}>
        <AppSidebar />
        <main className="app-shell flex-1 min-w-0 max-w-full flex flex-col">
          <header className="sticky top-0 z-30 h-12 shrink-0 flex items-center justify-between border-b border-border px-2 sm:px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <SidebarTrigger className="h-10 w-10 sm:h-9 sm:w-9" />
            <UserMenu />
          </header>
          <div className="flex-1 min-w-0 w-full max-w-[1800px] mx-auto px-3 py-4 sm:px-5 sm:py-5 md:px-6 lg:p-8 2xl:px-12">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
