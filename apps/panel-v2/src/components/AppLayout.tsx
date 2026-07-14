import { useEffect, useMemo, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePanelData } from "@/hooks/use-panel-data";
import { formatDateFullBr, formatTimeWithSecondsBr, formatWeekdayBr } from "@/lib/date-time";
import { LogOut } from "lucide-react";

export function AppLayout() {
  const { connected, user, logout } = usePanelData();
  const location = useLocation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const weekDayLabel = useMemo(() => formatWeekdayBr(now, "-"), [now]);
  const dateLabel = useMemo(() => formatDateFullBr(now, "-"), [now]);
  const timeLabel = useMemo(() => formatTimeWithSecondsBr(now, "--:--:--"), [now]);
  const page = useMemo(() => {
    if (location.pathname.startsWith("/atendimento")) return { title: "Atendimento", subtitle: "Conversas e automações" };
    if (location.pathname.startsWith("/ponto")) return { title: "Ponto", subtitle: "Equipe e jornadas" };
    if (location.pathname.startsWith("/configuracoes")) return { title: "Configurações", subtitle: "Preferências do sistema" };
    return { title: "Visão geral", subtitle: "Operação em tempo real" };
  }, [location.pathname]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-transparent">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center border-b border-border/60 bg-background/70 px-3 sm:px-5 gap-3 shrink-0 backdrop-blur-xl">
            <SidebarTrigger className="rounded-xl border border-border/70 bg-card/80 shadow-sm" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">{page.title}</h1>
              <p className="hidden truncate text-[11px] text-muted-foreground sm:block">{page.subtitle}</p>
            </div>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <div className="hidden items-center gap-2 rounded-xl border border-border/60 bg-card/70 px-3 py-1.5 lg:flex">
                <div className="text-right leading-tight">
                  <p className="text-[10px] capitalize text-muted-foreground">{weekDayLabel}, {dateLabel}</p>
                  <p className="text-xs font-semibold tabular-nums">{timeLabel}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-2.5 py-1.5 shadow-sm">
                <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-destructive"}`} />
                <span className="hidden text-xs font-medium sm:inline">{connected ? "Online" : "Reconectando"}</span>
              </div>
              {user?.fullname || user?.username ? (
                <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary md:flex" title={user.fullname || user.username}>
                  {String(user.fullname || user.username).slice(0, 2).toUpperCase()}
                </div>
              ) : null}
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-muted-foreground" onClick={logout} title="Sair">
                <LogOut className="h-4 w-4" />
              </Button>
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
