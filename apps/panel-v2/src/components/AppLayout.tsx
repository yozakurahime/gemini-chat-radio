import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePanelData } from "@/hooks/use-panel-data";
import GlobalYouTubeRadio from "@/components/GlobalYouTubeRadio";
import GlobalAdsController from "@/components/GlobalAdsController";

export function AppLayout() {
  const { connected, user, logout } = usePanelData();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <GlobalYouTubeRadio />
        <GlobalAdsController />
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b bg-card px-4 gap-4 shrink-0">
            <SidebarTrigger />
            <div className="flex items-center gap-3 ml-auto">
              <div className={`h-2 w-2 rounded-full ${connected ? "bg-primary animate-pulse" : "bg-destructive"}`} />
              <span className="text-sm text-muted-foreground">{connected ? "Sistema Online" : "Reconectando"}</span>
              {user?.fullname || user?.username ? (
                <span className="text-sm text-muted-foreground hidden sm:inline">{user.fullname || user.username}</span>
              ) : null}
              <Button variant="outline" size="sm" onClick={logout}>Sair</Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
