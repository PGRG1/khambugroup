import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { usePreviewMode } from "@/hooks/usePreviewMode";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { isPreviewActive } = usePreviewMode();
  
  return (
    <SidebarProvider>
      <div className={`min-h-screen flex w-full ${isPreviewActive ? "pt-10" : ""}`}>
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border/60 px-4 bg-background/70 backdrop-blur-md sticky top-0 z-30">
            <SidebarTrigger />
          </header>
          <div className="flex-1 w-full max-w-[1800px] mx-auto p-3 sm:p-6 lg:p-8 2xl:px-12">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
