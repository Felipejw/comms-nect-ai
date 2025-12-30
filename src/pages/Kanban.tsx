import { useState } from "react";
import { Plus, MoreHorizontal, Clock, MessageSquare, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface KanbanCard {
  id: string;
  name: string;
  message: string;
  time: string;
  priority: "low" | "medium" | "high";
  tags: string[];
  assignee?: string;
}

interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  cards: KanbanCard[];
}

const initialColumns: KanbanColumn[] = [
  {
    id: "new",
    title: "Novo",
    color: "bg-primary",
    cards: [
      { id: "1", name: "Maria Silva", message: "Preciso de ajuda com pedido", time: "5 min", priority: "high", tags: ["Urgente"], assignee: "Carlos" },
      { id: "2", name: "João Santos", message: "Dúvida sobre entrega", time: "15 min", priority: "medium", tags: ["Suporte"] },
      { id: "3", name: "Pedro Costa", message: "Problema com pagamento", time: "30 min", priority: "high", tags: ["Financeiro", "Urgente"] },
    ],
  },
  {
    id: "in_progress",
    title: "Em Atendimento",
    color: "bg-warning",
    cards: [
      { id: "4", name: "Ana Lima", message: "Acompanhamento de troca", time: "1h", priority: "medium", tags: ["Troca"], assignee: "Fernanda" },
      { id: "5", name: "Ricardo Alves", message: "Cancelamento de assinatura", time: "2h", priority: "low", tags: ["Cancelamento"], assignee: "Carlos" },
    ],
  },
  {
    id: "resolved",
    title: "Concluído",
    color: "bg-success",
    cards: [
      { id: "6", name: "Beatriz Mendes", message: "Agradecimento pelo atendimento", time: "3h", priority: "low", tags: ["Resolvido"] },
      { id: "7", name: "Lucas Oliveira", message: "Pedido recebido com sucesso", time: "4h", priority: "low", tags: ["Resolvido"] },
    ],
  },
];

const priorityConfig = {
  low: { label: "Baixa", className: "bg-muted text-muted-foreground" },
  medium: { label: "Média", className: "bg-warning/10 text-warning" },
  high: { label: "Alta", className: "bg-destructive/10 text-destructive" },
};

export default function Kanban() {
  const [columns, setColumns] = useState(initialColumns);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Kanban de Conversas</h2>
          <p className="text-muted-foreground">Gerencie o fluxo de atendimentos</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Nova Conversa
        </Button>
      </div>

      <div className="flex gap-6 overflow-x-auto pb-4">
        {columns.map((column) => (
          <div key={column.id} className="kanban-column min-w-[320px] flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={cn("w-3 h-3 rounded-full", column.color)} />
                <h3 className="font-semibold">{column.title}</h3>
                <Badge variant="secondary" className="ml-1">
                  {column.cards.length}
                </Badge>
              </div>
              <Button variant="ghost" size="icon" className="w-8 h-8">
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-3">
              {column.cards.map((card) => (
                <div key={card.id} className="kanban-card animate-fade-in">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {card.name.split(" ").map((n) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{card.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {card.time}
                        </p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="w-6 h-6">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Abrir conversa</DropdownMenuItem>
                        <DropdownMenuItem>Atribuir</DropdownMenuItem>
                        <DropdownMenuItem>Mover</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Arquivar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {card.message}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {card.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <Badge className={cn("text-xs", priorityConfig[card.priority].className)}>
                      {priorityConfig[card.priority].label}
                    </Badge>
                    {card.assignee && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="w-3 h-3" />
                        {card.assignee}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
