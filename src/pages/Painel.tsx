import { Activity, Users, MessageSquare, Clock, Wifi, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePanelStats, useActivityLog, useRecentConversationsPanel } from "@/hooks/usePanelStats";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Painel() {
  const { stats, isLoading: isLoadingStats, isError: isErrorStats, error: errorStats, refetch: refetchStats } = usePanelStats();
  const { activities, isLoading: isLoadingActivities, isError: isErrorActivities, error: errorActivities, refetch: refetchActivities } = useActivityLog();
  const { conversations, isLoading: isLoadingConversations, isError: isErrorConversations, error: errorConversations, refetch: refetchConversations } = useRecentConversationsPanel();

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

  const getActivityMessage = (activity: { action: string; entity_type: string; metadata?: unknown; userName?: string | null }) => {
    const actionMap: Record<string, string> = {
      "create": "criou",
      "update": "atualizou",
      "delete": "excluiu",
      "login": "entrou no sistema",
      "logout": "saiu do sistema",
      "send_message": "enviou mensagem",
      "receive_message": "recebeu mensagem",
      "execute_campaign": "executou campanha",
      "execute_flow": "executou fluxo",
      "reset_password": "redefiniu senha",
    };
    const entityMap: Record<string, string> = {
      "conversation": "conversa",
      "contact": "contato",
      "message": "mensagem",
      "user": "usuário",
      "campaign": "campanha",
      "connection": "conexão",
      "tag": "tag",
      "quick_reply": "resposta rápida",
      "chatbot_rule": "regra do chatbot",
    };

    const userName = activity.userName || null;
    const action = actionMap[activity.action] || activity.action;
    const entity = entityMap[activity.entity_type] || activity.entity_type;

    if (activity.action === "login" || activity.action === "logout") {
      return userName ? `${userName} ${action}` : action;
    }

    return userName ? `${userName} ${action} ${entity}` : `${action} ${entity}`;
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
        {isErrorStats ? (
          <div className="col-span-full flex flex-col items-center justify-center py-8 gap-3 bg-card rounded-xl border border-border">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{(errorStats as Error)?.message || "Erro ao carregar estatísticas"}</p>
            <Button variant="outline" size="sm" onClick={() => refetchStats()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Tentar novamente
            </Button>
          </div>
        ) : isLoadingStats ? (
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

      {/* Recent Conversations */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold text-lg mb-6 flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Conversas Recentes
        </h3>
        {isErrorConversations ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{(errorConversations as Error)?.message || "Erro ao carregar conversas"}</p>
            <Button variant="outline" size="sm" onClick={() => refetchConversations()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Tentar novamente
            </Button>
          </div>
        ) : isLoadingConversations ? (
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
        {isErrorActivities ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{(errorActivities as Error)?.message || "Erro ao carregar atividades"}</p>
            <Button variant="outline" size="sm" onClick={() => refetchActivities()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Tentar novamente
            </Button>
          </div>
        ) : isLoadingActivities ? (
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
