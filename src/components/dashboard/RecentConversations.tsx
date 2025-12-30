import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRecentConversations } from "@/hooks/useDashboardStats";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

const statusConfig = {
  new: { label: "Novo", className: "bg-primary/10 text-primary" },
  in_progress: { label: "Em Atendimento", className: "bg-warning/10 text-warning" },
  resolved: { label: "Resolvido", className: "bg-success/10 text-success" },
  archived: { label: "Arquivado", className: "bg-muted text-muted-foreground" },
};

export function RecentConversations() {
  const { data: conversations, isLoading } = useRecentConversations(5);
  const navigate = useNavigate();

  const formatTime = (date: string) => {
    return formatDistanceToNow(new Date(date), { addSuffix: false, locale: ptBR });
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-lg">Conversas Recentes</h3>
        </div>
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-lg">Conversas Recentes</h3>
        <button 
          onClick={() => navigate("/atendimento")} 
          className="text-sm text-primary hover:underline"
        >
          Ver todas
        </button>
      </div>
      
      {!conversations || conversations.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          Nenhuma conversa recente
        </div>
      ) : (
        <div className="space-y-4">
          {conversations.map((conv: any) => (
            <div
              key={conv.id}
              onClick={() => navigate("/atendimento")}
              className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <Avatar className="w-10 h-10">
                <AvatarImage src={conv.contact?.avatar_url} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                  {conv.contact?.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm truncate">{conv.contact?.name || "Contato"}</p>
                  <span className="text-xs text-muted-foreground">{formatTime(conv.last_message_at)}</span>
                </div>
                <p className="text-sm text-muted-foreground truncate">{conv.subject || "Sem assunto"}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={cn("text-xs", statusConfig[conv.status as keyof typeof statusConfig]?.className || "")}>
                  {statusConfig[conv.status as keyof typeof statusConfig]?.label || conv.status}
                </Badge>
                {conv.unread_count > 0 && (
                  <Badge className="bg-primary text-primary-foreground w-5 h-5 p-0 flex items-center justify-center rounded-full text-xs">
                    {conv.unread_count}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
