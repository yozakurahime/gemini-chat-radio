import { MessageSquare, Clock, Settings, Dumbbell, LayoutDashboard, Sparkles } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useMemo } from "react";
import { usePanelData } from "@/hooks/use-panel-data";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { chats, user } = usePanelData();
  const isAdmin = user?.role === "admin";
  const items = useMemo(
    () => [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Atendimento", url: "/atendimento", icon: MessageSquare },
      { title: "Ponto", url: "/ponto", icon: Clock },
      { title: "Configuracoes", url: "/configuracoes", icon: Settings },
    ],
    [isAdmin],
  );
  const unreadTotal = useMemo(
    () => chats.reduce((sum, chat) => sum + Number(chat.unreadCount || 0), 0),
    [chats],
  );
  const attentionTotal = useMemo(
    () => chats.reduce((sum, chat) => sum + (chat.attentionActive ? 1 : 0), 0),
    [chats],
  );

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-3 pb-4 pt-5">
        <div className="flex items-center gap-3 px-1">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_10px_30px_-12px_rgba(52,211,153,0.9)]">
            <Dumbbell className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <span className="block text-base font-bold tracking-tight text-sidebar-foreground">HimeFit</span>
              <span className="block text-[10px] text-sidebar-foreground/55">Academia Oxigênio</span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="px-2">
          <SidebarGroupLabel className="px-3 text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/40">Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isAtendimento = item.url === "/atendimento";
                const hasAttention = isAtendimento && attentionTotal > 0;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild className="h-11 rounded-xl">
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className={`transition-all duration-300 hover:bg-sidebar-accent/70 ${hasAttention ? "relative bg-amber-500/10 text-amber-100 ring-1 ring-amber-300/25" : ""}`}
                        activeClassName={`bg-sidebar-accent text-sidebar-primary font-semibold shadow-sm ${hasAttention ? "ring-1 ring-amber-300/40 text-amber-100" : ""}`}
                      >
                        <span className="relative inline-flex">
                          <item.icon className={`mr-2 h-4 w-4 ${hasAttention ? "text-amber-300" : ""}`} />
                          {hasAttention ? (
                            <>
                              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-300" />
                            </>
                          ) : null}
                        </span>
                        {!collapsed ? (
                          <span className={`${hasAttention ? "font-semibold text-amber-100" : ""}`}>
                            {item.title}
                          </span>
                        ) : null}
                        {!collapsed && hasAttention ? (
                          <span className="ml-auto text-[9px] uppercase tracking-wider text-amber-200">Urgente</span>
                        ) : null}
                      </NavLink>
                    </SidebarMenuButton>
                    {isAtendimento && unreadTotal > 0 && !collapsed ? (
                      <SidebarMenuBadge className={hasAttention ? "bg-amber-500 text-white shadow-sm ring-1 ring-amber-300/40" : ""}>
                        {unreadTotal > 99 ? "99+" : unreadTotal}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        <div className={`rounded-2xl border border-sidebar-border bg-sidebar-accent/45 p-3 ${collapsed ? "grid place-items-center" : ""}`}>
          <Sparkles className="h-4 w-4 text-sidebar-primary" />
          {!collapsed ? (
            <div className="mt-2">
              <p className="text-xs font-medium text-sidebar-foreground">Hime assistente</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-sidebar-foreground/50">Automação e equipe no mesmo fluxo.</p>
            </div>
          ) : null}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
