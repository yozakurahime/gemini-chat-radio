import { MessageSquare, Clock, Settings, Dumbbell } from "lucide-react";
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
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Atendimento", url: "/", icon: MessageSquare },
  { title: "Ponto", url: "/ponto", icon: Clock },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { chats } = usePanelData();
  const unreadTotal = useMemo(
    () => chats.reduce((sum, chat) => sum + Number(chat.unreadCount || 0), 0),
    [chats],
  );
  const attentionTotal = useMemo(
    () => chats.reduce((sum, chat) => sum + (chat.attentionActive ? 1 : 0), 0),
    [chats],
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-6 w-6 text-sidebar-primary" />
          {!collapsed && (
            <span className="font-bold text-lg text-sidebar-foreground">
              GymPanel
            </span>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isAtendimento = item.url === "/";
                const hasAttention = isAtendimento && attentionTotal > 0;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className={`hover:bg-sidebar-accent/50 ${hasAttention ? "relative bg-amber-500/15 text-amber-100 ring-1 ring-amber-300/60 motion-safe:animate-pulse motion-reduce:animate-none" : ""}`}
                        activeClassName={`bg-sidebar-accent text-sidebar-primary font-medium ${hasAttention ? "ring-1 ring-amber-300/70 text-amber-100" : ""}`}
                      >
                        <span className="relative inline-flex">
                          <item.icon className={`mr-2 h-4 w-4 ${hasAttention ? "text-amber-300" : ""}`} />
                          {hasAttention && (
                            <>
                              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-300" />
                              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-300 motion-safe:animate-ping motion-reduce:animate-none" />
                            </>
                          )}
                        </span>
                        {!collapsed && (
                          <span className={`${hasAttention ? "font-semibold text-amber-100" : ""}`}>
                            {item.title}
                          </span>
                        )}
                        {!collapsed && hasAttention ? (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-200">Urgente</span>
                        ) : null}
                      </NavLink>
                    </SidebarMenuButton>
                    {isAtendimento && unreadTotal > 0 && !collapsed ? (
                      <SidebarMenuBadge className={hasAttention ? "bg-amber-500 text-white shadow-sm ring-1 ring-amber-300/80 motion-safe:animate-pulse motion-reduce:animate-none" : ""}>
                        {hasAttention ? `NOVA ${unreadTotal > 99 ? "99+" : unreadTotal}` : (unreadTotal > 99 ? "99+" : unreadTotal)}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
