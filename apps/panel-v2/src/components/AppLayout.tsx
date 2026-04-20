import { useEffect, useMemo, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePanelData } from "@/hooks/use-panel-data";
import GlobalYouTubeRadio from "@/components/GlobalYouTubeRadio";
import GlobalAdsController from "@/components/GlobalAdsController";
import { formatDateFullBr, formatTimeWithSecondsBr, formatWeekdayBr } from "@/lib/date-time";

export function AppLayout() {
  const { connected, user, logout } = usePanelData();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const weekDayLabel = useMemo(() => formatWeekdayBr(now, "-"), [now]);
  const dateLabel = useMemo(() => formatDateFullBr(now, "-"), [now]);
  const timeLabel = useMemo(() => formatTimeWithSecondsBr(now, "--:--:--"), [now]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <GlobalYouTubeRadio />
        <GlobalAdsController />
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b bg-card px-4 gap-4 shrink-0">
            <SidebarTrigger />
            <div className="hidden md:flex flex-col leading-tight">
              <span className="text-[11px] text-muted-foreground">{weekDayLabel}</span>
              <span className="text-xs text-muted-foreground">{dateLabel}</span>
            </div>
            <div className="flex items-center rounded-md border px-2 py-1 text-xs font-semibold tabular-nums">
              {timeLabel}
            </div>
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
