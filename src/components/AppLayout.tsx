import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { usePreviewMode } from "@/hooks/usePreviewMode";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { isPreviewActive } = usePreviewMode();
  
  return (
    <SidebarProvider>
      <div className={`min-h-screen flex w-full ${isPreviewActive ? "pt-10" : ""}`}>
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="h-12 flex items-center border-b border-border px-4 bg-background">
            <SidebarTrigger />
          </header>
          <div className="flex-1 p-3 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
