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
  BarChart3,
  FileText,
  Activity,
  Send,
  GitBranch,
  Code,
  UserCog,
  Bot,
  Brain,
  Plug,
  QrCode,
  Kanban,
  MessagesSquare,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NavSection {
  title: string;
  items: NavItem[];
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
}

const navSections: NavSection[] = [
  {
    title: "Gerência",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Relatórios", href: "/relatorios", icon: FileText },
      { title: "Painel", href: "/painel", icon: Activity },
    ],
  },
  {
    title: "Atendimento",
    items: [
      { title: "WhatsApp", href: "/atendimento", icon: MessageSquare },
      { title: "Respostas Rápidas", href: "/respostas-rapidas", icon: Zap },
      { title: "Kanban", href: "/kanban", icon: Kanban },
      { title: "Contatos", href: "/contatos", icon: Users },
      { title: "Agendamentos", href: "/agendamentos", icon: Calendar },
      { title: "Tags", href: "/tags", icon: Tags },
      { title: "Chat Interno", href: "/chat-interno", icon: MessagesSquare },
    ],
  },
  {
    title: "Administração",
    items: [
      { title: "Campanhas", href: "/campanhas", icon: Send },
      { title: "FlowBuilder", href: "/flowbuilder", icon: GitBranch },
      { title: "API Interna", href: "/api", icon: Code },
      { title: "Usuários", href: "/usuarios", icon: UserCog },
      { title: "Filas & Chatbot", href: "/filas-chatbot", icon: Bot },
      { title: "Talk.AI", href: "/talk-ai", icon: Brain },
      { title: "Integrações", href: "/integracoes", icon: Plug },
      { title: "Conexões", href: "/conexoes", icon: QrCode },
    ],
  },
];

export function AppSidebar() {
  const location = useLocation();
  const [expandedSections, setExpandedSections] = useState<string[]>(["Gerência", "Atendimento", "Administração"]);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleSection = (title: string) => {
    setExpandedSections((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    );
  };

  const isActive = (href: string) => location.pathname === href;

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
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">TalkFlow</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {isCollapsed ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-thin">
        {navSections.map((section) => (
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

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <NavLink
          to="/configuracoes"
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
