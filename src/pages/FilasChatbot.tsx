import { useState } from "react";
import { Plus, Search, Users, Bot, Settings, MoreHorizontal, Play, Pause, Edit, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface Queue {
  id: string;
  name: string;
  description: string;
  agents: string[];
  waitingCount: number;
  status: "active" | "paused";
  avgWaitTime: string;
}

interface ChatbotRule {
  id: string;
  trigger: string;
  response: string;
  isActive: boolean;
  matchCount: number;
}

const queues: Queue[] = [
  { id: "1", name: "Suporte Geral", description: "Atendimento geral ao cliente", agents: ["Carlos", "Fernanda"], waitingCount: 5, status: "active", avgWaitTime: "2 min" },
  { id: "2", name: "Vendas", description: "Equipe comercial", agents: ["Ricardo", "Ana"], waitingCount: 3, status: "active", avgWaitTime: "1 min" },
  { id: "3", name: "Financeiro", description: "Dúvidas sobre pagamentos", agents: ["Patricia"], waitingCount: 2, status: "active", avgWaitTime: "5 min" },
  { id: "4", name: "Técnico", description: "Suporte técnico especializado", agents: ["Lucas", "Pedro"], waitingCount: 0, status: "paused", avgWaitTime: "-" },
];

const chatbotRules: ChatbotRule[] = [
  { id: "1", trigger: "olá|oi|bom dia|boa tarde", response: "Olá! Seja bem-vindo(a)! Como posso ajudá-lo(a) hoje?", isActive: true, matchCount: 1250 },
  { id: "2", trigger: "preço|valor|quanto custa", response: "Você gostaria de saber sobre nossos preços? Um de nossos atendentes irá ajudá-lo em breve.", isActive: true, matchCount: 856 },
  { id: "3", trigger: "horário|funcionamento", response: "Nosso horário de atendimento é de segunda a sexta, das 8h às 18h.", isActive: true, matchCount: 423 },
  { id: "4", trigger: "cancelar|cancelamento", response: "Entendemos que deseja cancelar. Você será transferido para nossa equipe de retenção.", isActive: false, matchCount: 189 },
];

export default function FilasChatbot() {
  const [isQueueDialogOpen, setIsQueueDialogOpen] = useState(false);
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Filas & Chatbot</h2>
          <p className="text-muted-foreground">Configure filas de atendimento e regras do chatbot</p>
        </div>
      </div>

      <Tabs defaultValue="queues" className="space-y-6">
        <TabsList>
          <TabsTrigger value="queues" className="gap-2">
            <Users className="w-4 h-4" />
            Filas de Atendimento
          </TabsTrigger>
          <TabsTrigger value="chatbot" className="gap-2">
            <Bot className="w-4 h-4" />
            Regras do Chatbot
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queues" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar filas..." className="pl-9" />
            </div>
            <Dialog open={isQueueDialogOpen} onOpenChange={setIsQueueDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Nova Fila
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Fila</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nome da Fila</Label>
                    <Input placeholder="Ex: Suporte Premium" />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Textarea placeholder="Descrição da fila" />
                  </div>
                  <Button className="w-full" onClick={() => setIsQueueDialogOpen(false)}>
                    Criar Fila
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {queues.map((queue) => (
              <Card key={queue.id} className="animate-fade-in">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {queue.name}
                        <Badge className={queue.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>
                          {queue.status === "active" ? "Ativa" : "Pausada"}
                        </Badge>
                      </CardTitle>
                      <CardDescription>{queue.description}</CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Settings className="w-4 h-4 mr-2" />
                          Configurar
                        </DropdownMenuItem>
                        {queue.status === "active" ? (
                          <DropdownMenuItem>
                            <Pause className="w-4 h-4 mr-2" />
                            Pausar
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem>
                            <Play className="w-4 h-4 mr-2" />
                            Ativar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Aguardando</span>
                    <Badge variant="secondary">{queue.waitingCount} pessoas</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Tempo médio</span>
                    <span className="text-sm font-medium">{queue.avgWaitTime}</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground mb-2 block">Atendentes</span>
                    <div className="flex -space-x-2">
                      {queue.agents.map((agent) => (
                        <Avatar key={agent} className="w-8 h-8 border-2 border-card">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {agent[0]}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      <Button variant="outline" size="icon" className="w-8 h-8 rounded-full">
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="chatbot" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar regras..." className="pl-9" />
            </div>
            <Dialog open={isRuleDialogOpen} onOpenChange={setIsRuleDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Nova Regra
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Regra do Chatbot</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Gatilho (palavras-chave)</Label>
                    <Input placeholder="Ex: olá|oi|bom dia" />
                    <p className="text-xs text-muted-foreground">Separe as palavras com | (pipe)</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Resposta Automática</Label>
                    <Textarea placeholder="Mensagem que será enviada automaticamente" rows={4} />
                  </div>
                  <Button className="w-full" onClick={() => setIsRuleDialogOpen(false)}>
                    Criar Regra
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-3">
            {chatbotRules.map((rule) => (
              <div
                key={rule.id}
                className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow animate-fade-in"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Bot className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-medium">Gatilho</p>
                      <code className="text-sm bg-muted px-2 py-1 rounded">{rule.trigger}</code>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={rule.isActive} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Edit className="w-4 h-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 mb-3">
                  <p className="text-sm">{rule.response}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Acionado {rule.matchCount.toLocaleString()} vezes
                </p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
