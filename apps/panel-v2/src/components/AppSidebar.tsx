import { MessageSquare, Radio, Clock, Settings, Dumbbell } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
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
  { title: "Rádio", url: "/radio", icon: Radio },
  { title: "Ponto", url: "/ponto", icon: Clock },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { chats } = usePanelData();
  const unreadTotal = useMemo(
    () => chats.reduce((sum, chat) => sum + Number(chat.unreadCount || 0), 0),
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
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                  {item.url === "/" && unreadTotal > 0 && !collapsed ? (
                    <SidebarMenuBadge>{unreadTotal > 99 ? "99+" : unreadTotal}</SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
