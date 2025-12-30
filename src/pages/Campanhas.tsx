import { useState } from "react";
import { Plus, Search, Filter, MoreHorizontal, Play, Pause, BarChart3, Users, Send, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Campaign {
  id: string;
  name: string;
  description: string;
  status: "draft" | "active" | "paused" | "completed";
  audience: number;
  sent: number;
  delivered: number;
  opened: number;
  scheduledAt?: string;
  createdAt: string;
}

const campaigns: Campaign[] = [
  {
    id: "1",
    name: "Promoção de Natal",
    description: "Campanha de fim de ano com descontos especiais",
    status: "active",
    audience: 5000,
    sent: 3500,
    delivered: 3450,
    opened: 2100,
    createdAt: "20/12/2024",
  },
  {
    id: "2",
    name: "Black Friday 2024",
    description: "Mega descontos para Black Friday",
    status: "completed",
    audience: 8000,
    sent: 8000,
    delivered: 7850,
    opened: 5200,
    createdAt: "15/11/2024",
  },
  {
    id: "3",
    name: "Lançamento Produto X",
    description: "Anúncio do novo produto da linha premium",
    status: "draft",
    audience: 2500,
    sent: 0,
    delivered: 0,
    opened: 0,
    scheduledAt: "05/01/2025",
    createdAt: "28/12/2024",
  },
  {
    id: "4",
    name: "Newsletter Mensal",
    description: "Newsletter com novidades e dicas",
    status: "paused",
    audience: 12000,
    sent: 6000,
    delivered: 5900,
    opened: 2800,
    createdAt: "01/12/2024",
  },
];

const statusConfig = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  active: { label: "Ativa", className: "bg-success/10 text-success" },
  paused: { label: "Pausada", className: "bg-warning/10 text-warning" },
  completed: { label: "Concluída", className: "bg-primary/10 text-primary" },
};

export default function Campanhas() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredCampaigns = campaigns.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Campanhas</h2>
          <p className="text-muted-foreground">Crie e gerencie suas campanhas de mensagens</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Nova Campanha
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Criar Campanha</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome da Campanha</Label>
                <Input placeholder="Ex: Promoção de Verão" />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea placeholder="Descreva o objetivo da campanha" />
              </div>
              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea placeholder="Digite a mensagem da campanha" rows={4} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Segmentação</Label>
                  <Input placeholder="Todos os contatos" />
                </div>
                <div className="space-y-2">
                  <Label>Agendamento</Label>
                  <Input type="datetime-local" />
                </div>
              </div>
              <Button className="w-full" onClick={() => setIsDialogOpen(false)}>
                Criar Campanha
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar campanhas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" className="gap-2">
          <Filter className="w-4 h-4" />
          Filtrar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredCampaigns.map((campaign) => {
          const deliveryRate = campaign.sent > 0 ? Math.round((campaign.delivered / campaign.sent) * 100) : 0;
          const openRate = campaign.delivered > 0 ? Math.round((campaign.opened / campaign.delivered) * 100) : 0;

          return (
            <Card key={campaign.id} className="animate-fade-in">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{campaign.name}</CardTitle>
                    <CardDescription>{campaign.description}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusConfig[campaign.status].className}>
                      {statusConfig[campaign.status].label}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <BarChart3 className="w-4 h-4 mr-2" />
                          Ver estatísticas
                        </DropdownMenuItem>
                        {campaign.status === "active" ? (
                          <DropdownMenuItem>
                            <Pause className="w-4 h-4 mr-2" />
                            Pausar
                          </DropdownMenuItem>
                        ) : campaign.status === "paused" || campaign.status === "draft" ? (
                          <DropdownMenuItem>
                            <Play className="w-4 h-4 mr-2" />
                            {campaign.status === "draft" ? "Iniciar" : "Retomar"}
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem className="text-destructive">
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                      <Users className="w-4 h-4" />
                      <span className="text-xs">Audiência</span>
                    </div>
                    <p className="font-semibold">{campaign.audience.toLocaleString()}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                      <Send className="w-4 h-4" />
                      <span className="text-xs">Enviadas</span>
                    </div>
                    <p className="font-semibold">{campaign.sent.toLocaleString()}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                      <BarChart3 className="w-4 h-4" />
                      <span className="text-xs">Abertas</span>
                    </div>
                    <p className="font-semibold">{campaign.opened.toLocaleString()}</p>
                  </div>
                </div>

                {campaign.status !== "draft" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Progresso</span>
                      <span className="font-medium">{Math.round((campaign.sent / campaign.audience) * 100)}%</span>
                    </div>
                    <Progress value={(campaign.sent / campaign.audience) * 100} className="h-2" />
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
                  <span className="text-muted-foreground">
                    {campaign.scheduledAt ? (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Agendada para {campaign.scheduledAt}
                      </span>
                    ) : (
                      `Criada em ${campaign.createdAt}`
                    )}
                  </span>
                  {campaign.status !== "draft" && (
                    <span className="text-muted-foreground">
                      Taxa de abertura: <strong className="text-foreground">{openRate}%</strong>
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
