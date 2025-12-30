import { Plus, Play, Save, Settings, MessageSquare, GitBranch, Clock, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const flowBlocks = [
  { id: "trigger", icon: Zap, label: "Gatilho", color: "bg-primary" },
  { id: "message", icon: MessageSquare, label: "Mensagem", color: "bg-success" },
  { id: "condition", icon: GitBranch, label: "Condição", color: "bg-warning" },
  { id: "delay", icon: Clock, label: "Aguardar", color: "bg-info" },
];

const sampleFlow = [
  { id: "1", type: "trigger", title: "Nova Conversa", description: "Quando um novo contato iniciar conversa" },
  { id: "2", type: "message", title: "Saudação", description: "Olá! Seja bem-vindo ao nosso atendimento..." },
  { id: "3", type: "condition", title: "Horário Comercial?", description: "Verificar se está em horário de atendimento" },
  { id: "4", type: "message", title: "Fora do Horário", description: "Nosso horário é das 8h às 18h..." },
];

export default function FlowBuilder() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">FlowBuilder</h2>
          <p className="text-muted-foreground">Crie fluxos de automação para seu chatbot</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2">
            <Play className="w-4 h-4" />
            Testar
          </Button>
          <Button className="gap-2">
            <Save className="w-4 h-4" />
            Salvar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Blocks Palette */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Blocos</CardTitle>
              <CardDescription>Arraste para adicionar ao fluxo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {flowBlocks.map((block) => (
                <div
                  key={block.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-grab hover:bg-muted/50 transition-colors"
                >
                  <div className={`p-2 rounded-lg ${block.color}`}>
                    <block.icon className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-medium text-sm">{block.label}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Flow Canvas */}
        <div className="lg:col-span-3">
          <Card className="min-h-[600px]">
            <CardHeader className="border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Fluxo de Boas-vindas</CardTitle>
                  <CardDescription>Fluxo padrão para novos contatos</CardDescription>
                </div>
                <Badge className="bg-success/10 text-success">Ativo</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {sampleFlow.map((node, index) => (
                  <div key={node.id}>
                    <div className="flex items-start gap-4 p-4 rounded-xl border border-border bg-card hover:shadow-md transition-shadow cursor-pointer">
                      <div
                        className={`p-2 rounded-lg ${
                          node.type === "trigger"
                            ? "bg-primary"
                            : node.type === "message"
                            ? "bg-success"
                            : "bg-warning"
                        }`}
                      >
                        {node.type === "trigger" && <Zap className="w-5 h-5 text-white" />}
                        {node.type === "message" && <MessageSquare className="w-5 h-5 text-white" />}
                        {node.type === "condition" && <GitBranch className="w-5 h-5 text-white" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-medium">{node.title}</h4>
                          <Button variant="ghost" size="icon" className="w-8 h-8">
                            <Settings className="w-4 h-4" />
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">{node.description}</p>
                      </div>
                    </div>
                    {index < sampleFlow.length - 1 && (
                      <div className="flex justify-center py-2">
                        <ArrowRight className="w-5 h-5 text-muted-foreground rotate-90" />
                      </div>
                    )}
                  </div>
                ))}

                <Button variant="outline" className="w-full gap-2 border-dashed border-2">
                  <Plus className="w-4 h-4" />
                  Adicionar Bloco
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
