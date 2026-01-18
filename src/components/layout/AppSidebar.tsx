import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Calendar,
  Tags,
  Zap,
  Settings,
  ChevronDown,
  ChevronRight,
  FileText,
  Activity,
  HeartPulse,
  Send,
  UserCog,
  Bot,
  Plug,
  QrCode,
  Kanban,
  MessagesSquare,
  ChevronsLeft,
  ChevronsRight,
  Building2,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ROUTE_TO_MODULE, type ModuleKey } from "@/hooks/usePermissions";
import { useSystemSettings } from "@/hooks/useSystemSettings";

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  module?: ModuleKey;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Gerência",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, module: "dashboard" },
      { title: "Relatórios", href: "/relatorios", icon: FileText, module: "relatorios" },
      { title: "Painel", href: "/painel", icon: Activity, module: "painel" },
    ],
  },
  {
    title: "Atendimento",
    items: [
      { title: "WhatsApp", href: "/atendimento", icon: MessageSquare, module: "atendimento" },
      { title: "Respostas Rápidas", href: "/respostas-rapidas", icon: Zap, module: "respostas_rapidas" },
      { title: "CRM", href: "/kanban", icon: Kanban, module: "kanban" },
      { title: "Contatos", href: "/contatos", icon: Users, module: "contatos" },
      { title: "Agendamentos", href: "/agendamentos", icon: Calendar, module: "agendamentos" },
      { title: "Tags", href: "/tags", icon: Tags, module: "tags" },
      { title: "Chat Interno", href: "/chat-interno", icon: MessagesSquare, module: "chat_interno" },
    ],
  },
  {
    title: "Administração",
    items: [
      { title: "Disparo em Massa", href: "/campanhas", icon: Send, module: "campanhas" },
      { title: "Chatbot", href: "/chatbot", icon: Bot, module: "chatbot" },
      { title: "Atendentes", href: "/usuarios", icon: UserCog, module: "usuarios" },
      { title: "Setores", href: "/filas-chatbot", icon: Building2, module: "setores" },
      { title: "Integrações", href: "/integracoes", icon: Plug, module: "integracoes" },
      { title: "Conexões", href: "/conexoes", icon: QrCode, module: "conexoes" },
      { title: "Diagnóstico", href: "/diagnostico", icon: HeartPulse, module: "conexoes" },
    ],
  },
];

interface AppSidebarProps {
  onNavigate?: () => void;
}

export function AppSidebar({ onNavigate }: AppSidebarProps) {
  const location = useLocation();
  const { hasPermission, isAdmin, isSuperAdmin } = useAuth();
  const { getSetting } = useSystemSettings();
  const [expandedSections, setExpandedSections] = useState<string[]>(["Gerência", "Atendimento", "Administração"]);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const platformName = getSetting("platform_name") || "TalkFlow";
  const platformLogo = getSetting("platform_logo");

  const toggleSection = (title: string) => {
    setExpandedSections((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    );
  };

  const isActive = (href: string) => location.pathname === href;

  // Filter items based on permissions
  const getFilteredItems = (items: NavItem[]) => {
    // Admin sees everything
    if (isAdmin) return items;
    
    return items.filter(item => {
      if (!item.module) return true;
      return hasPermission(item.module, 'view');
    });
  };

  // Filter sections that have at least one visible item
  const getVisibleSections = () => {
    return navSections
      .map(section => ({
        ...section,
        items: getFilteredItems(section.items),
      }))
      .filter(section => section.items.length > 0);
  };

  const visibleSections = getVisibleSections();

  return (
    <aside
      className={cn(
        "h-screen bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 border-r border-sidebar-border",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            {platformLogo ? (
              <img 
                src={platformLogo} 
                alt={platformName} 
                className="w-8 h-8 object-contain rounded-lg"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-primary-foreground" />
              </div>
            )}
            <span className="font-bold text-lg">{platformName}</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
          title={isCollapsed ? "Expandir menu" : "Recolher menu"}
        >
          {isCollapsed ? <ChevronsRight className="w-5 h-5" /> : <ChevronsLeft className="w-5 h-5" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-thin">
        {visibleSections.map((section) => (
          <div key={section.title} className="mb-4">
            {!isCollapsed && (
              <button
                onClick={() => toggleSection(section.title)}
                className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-muted hover:text-sidebar-foreground transition-colors"
              >
                {section.title}
                {expandedSections.includes(section.title) ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            )}

            {(isCollapsed || expandedSections.includes(section.title)) && (
              <ul className="space-y-1 mt-1">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      to={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "sidebar-link",
                        isActive(item.href) && "sidebar-link-active",
                        isCollapsed && "justify-center px-2"
                      )}
                      title={isCollapsed ? item.title : undefined}
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {!isCollapsed && <span className="truncate">{item.title}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </nav>

      {/* Footer - Settings and Super Admin */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        {isSuperAdmin && (
          <NavLink
            to="/super-admin"
            onClick={onNavigate}
            className={cn(
              "sidebar-link bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20",
              isActive("/super-admin") && "sidebar-link-active from-amber-500/20 to-orange-500/20",
              isCollapsed && "justify-center px-2"
            )}
            title={isCollapsed ? "Super Admin" : undefined}
          >
            <Crown className="w-5 h-5 text-amber-500" />
            {!isCollapsed && <span className="text-amber-600 dark:text-amber-400 font-medium">Super Admin</span>}
          </NavLink>
        )}
        <NavLink
          to="/configuracoes"
          onClick={onNavigate}
          className={cn(
            "sidebar-link",
            isActive("/configuracoes") && "sidebar-link-active",
            isCollapsed && "justify-center px-2"
          )}
        >
          <Settings className="w-5 h-5" />
          {!isCollapsed && <span>Configurações</span>}
        </NavLink>
      </div>
    </aside>
  );
}
