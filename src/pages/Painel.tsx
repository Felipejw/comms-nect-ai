import { Activity, Users, MessageSquare, Clock, Wifi, WifiOff, Server, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

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

const realtimeStats = [
  { label: "Atendentes Online", value: 12, icon: Users, color: "text-success" },
  { label: "Em Atendimento", value: 28, icon: MessageSquare, color: "text-primary" },
  { label: "Tempo Médio Atual", value: "3.2 min", icon: Clock, color: "text-warning" },
  { label: "Na Fila", value: 15, icon: Activity, color: "text-info" },
];

const statusConfig = {
  online: { label: "Online", className: "bg-success/10 text-success", icon: Wifi },
  offline: { label: "Offline", className: "bg-destructive/10 text-destructive", icon: WifiOff },
  degraded: { label: "Degradado", className: "bg-warning/10 text-warning", icon: Activity },
};

export default function Painel() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Painel do Sistema</h2>
          <p className="text-muted-foreground">Monitoramento em tempo real</p>
        </div>
        <Badge className="bg-success/10 text-success animate-pulse-soft">
          <Wifi className="w-3 h-3 mr-1" />
          Ao Vivo
        </Badge>
      </div>

      {/* Real-time Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {realtimeStats.map((stat) => (
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
        ))}
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

      {/* Activity Feed */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold text-lg mb-6 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Atividade Recente
        </h3>
        <div className="space-y-4">
          {[
            { time: "Agora", event: "Carlos iniciou atendimento com Maria Silva", type: "chat" },
            { time: "2 min", event: "Fernanda resolveu conversa #4523", type: "resolved" },
            { time: "5 min", event: "Novo contato registrado: Pedro Alves", type: "contact" },
            { time: "8 min", event: "Campanha 'Natal 2024' enviada para 2.500 contatos", type: "campaign" },
            { time: "15 min", event: "Ricardo entrou no sistema", type: "login" },
            { time: "20 min", event: "Chatbot respondeu 15 mensagens automaticamente", type: "bot" },
          ].map((activity, index) => (
            <div key={index} className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground w-16">{activity.time}</span>
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span>{activity.event}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
