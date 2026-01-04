import { Activity, Users, MessageSquare, Clock, Wifi, WifiOff, Server, Database, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePanelStats, useActivityLog, useRecentConversationsPanel } from "@/hooks/usePanelStats";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SystemStatus {
  name: string;
  status: "online" | "offline" | "degraded";
  uptime: string;
  load: number;
}

const systems: SystemStatus[] = [
  { name: "Servidor Principal", status: "online", uptime: "99.98%", load: 42 },
  { name: "Banco de Dados", status: "online", uptime: "99.95%", load: 38 },
  { name: "API Gateway", status: "online", uptime: "99.99%", load: 25 },
  { name: "Serviço de Mensagens", status: "online", uptime: "99.90%", load: 67 },
];

const statusConfig = {
  online: { label: "Online", className: "bg-success/10 text-success", icon: Wifi },
  offline: { label: "Offline", className: "bg-destructive/10 text-destructive", icon: WifiOff },
  degraded: { label: "Degradado", className: "bg-warning/10 text-warning", icon: Activity },
};

export default function Painel() {
  const { stats, isLoading: isLoadingStats } = usePanelStats();
  const { activities, isLoading: isLoadingActivities } = useActivityLog();
  const { conversations, isLoading: isLoadingConversations } = useRecentConversationsPanel();

  const realtimeStats = [
    { label: "Atendentes Online", value: stats?.agentsOnline ?? 0, icon: Users, color: "text-success" },
    { label: "Em Atendimento", value: stats?.inProgress ?? 0, icon: MessageSquare, color: "text-primary" },
    { label: "Tempo Médio Atual", value: `${stats?.avgTimeMinutes ?? 0} min`, icon: Clock, color: "text-warning" },
    { label: "Na Fila", value: stats?.inQueue ?? 0, icon: Activity, color: "text-info" },
  ];

  const formatActivityTime = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: false, locale: ptBR });
    } catch {
      return "agora";
    }
  };

  const getActivityMessage = (activity: { action: string; entity_type: string; metadata?: unknown }) => {
    const actionMap: Record<string, string> = {
      "create": "criou",
      "update": "atualizou",
      "delete": "excluiu",
      "login": "entrou no sistema",
      "logout": "saiu do sistema",
    };
    const entityMap: Record<string, string> = {
      "conversation": "conversa",
      "contact": "contato",
      "message": "mensagem",
      "user": "usuário",
      "campaign": "campanha",
    };

    const action = actionMap[activity.action] || activity.action;
    const entity = entityMap[activity.entity_type] || activity.entity_type;

    if (activity.action === "login" || activity.action === "logout") {
      return action;
    }

    return `${action} ${entity}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Painel do Sistema</h2>
          <p className="text-muted-foreground">Monitoramento em tempo real</p>
        </div>
        <Badge className="bg-success/10 text-success animate-pulse">
          <Wifi className="w-3 h-3 mr-1" />
          Ao Vivo
        </Badge>
      </div>

      {/* Real-time Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isLoadingStats ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </>
        ) : (
          realtimeStats.map((stat) => (
            <div key={stat.label} className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg bg-muted", stat.color)}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* System Status */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold text-lg mb-6 flex items-center gap-2">
          <Server className="w-5 h-5" />
          Status dos Serviços
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {systems.map((system) => {
            const StatusIcon = statusConfig[system.status].icon;
            return (
              <div
                key={system.name}
                className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium">{system.name}</p>
                    <p className="text-sm text-muted-foreground">Uptime: {system.uptime}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-medium">{system.load}%</p>
                    <Progress value={system.load} className="w-20 h-2" />
                  </div>
                  <Badge className={statusConfig[system.status].className}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {statusConfig[system.status].label}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Conversations */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold text-lg mb-6 flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Conversas Recentes
        </h3>
        {isLoadingConversations ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhuma conversa recente</p>
        ) : (
          <div className="space-y-3">
            {conversations.slice(0, 6).map((conv) => (
              <div key={conv.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <div>
                    <p className="font-medium">{(conv.contacts as { name: string } | null)?.name || "Contato desconhecido"}</p>
                    <p className="text-sm text-muted-foreground">
                      {conv.assignedName ? `Atendente: ${conv.assignedName}` : "Sem atendente"}
                    </p>
                  </div>
                </div>
                <Badge 
                  variant="outline" 
                  className={cn(
                    conv.status === "in_progress" && "bg-primary/10 text-primary",
                    conv.status === "new" && "bg-warning/10 text-warning",
                    conv.status === "resolved" && "bg-success/10 text-success",
                  )}
                >
                  {conv.status === "in_progress" ? "Em atendimento" : 
                   conv.status === "new" ? "Na fila" : 
                   conv.status === "resolved" ? "Resolvido" : conv.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity Feed */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold text-lg mb-6 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Atividade Recente
        </h3>
        {isLoadingActivities ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : activities.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhuma atividade recente registrada</p>
        ) : (
          <div className="space-y-4">
            {activities.slice(0, 10).map((activity) => (
              <div key={activity.id} className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground w-20">{formatActivityTime(activity.created_at)}</span>
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span>{getActivityMessage(activity)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
