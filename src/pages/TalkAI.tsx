import { useState, useEffect } from "react";
import { Brain, Settings, MessageSquare, Sparkles, RefreshCw, Save, Zap, HelpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAISettings, useUpdateAISettings } from "@/hooks/useChatbot";
import { toast } from "sonner";

const aiModels = [
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "Google" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini", provider: "OpenAI" },
  { value: "openai/gpt-5", label: "GPT-5", provider: "OpenAI" },
];

export default function TalkAI() {
  const { data: settings, isLoading } = useAISettings();
  const updateSettings = useUpdateAISettings();
  
  const [isEnabled, setIsEnabled] = useState(true);
  const [selectedModel, setSelectedModel] = useState("google/gemini-2.5-flash");
  const [creativity, setCreativity] = useState([50]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [knowledgeBase, setKnowledgeBase] = useState("");

  useEffect(() => {
    if (settings) {
      setIsEnabled(settings.is_enabled ?? true);
      setSelectedModel(settings.model ?? "google/gemini-2.5-flash");
      setCreativity([(settings.temperature ?? 0.5) * 100]);
      setSystemPrompt(settings.system_prompt ?? "");
      setKnowledgeBase(settings.knowledge_base ?? "");
    }
  }, [settings]);

  const handleSave = async () => {
    if (!settings) return;
    
    await updateSettings.mutateAsync({
      id: settings.id,
      is_enabled: isEnabled,
      model: selectedModel,
      temperature: creativity[0] / 100,
      system_prompt: systemPrompt,
      knowledge_base: knowledgeBase,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-7 h-7 text-primary" />
            Chatbot IA
          </h2>
          <p className="text-muted-foreground">Inteligência artificial para respostas automáticas</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            <Badge className={isEnabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>
              {isEnabled ? "Ativo" : "Inativo"}
            </Badge>
          </div>
          <Button className="gap-2" onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Salvar Configurações
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageSquare className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">1.234</p>
                <p className="text-sm text-muted-foreground">Respostas hoje</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <Sparkles className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">94%</p>
                <p className="text-sm text-muted-foreground">Taxa de satisfação</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <Zap className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">2.5s</p>
                <p className="text-sm text-muted-foreground">Tempo de resposta</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-info/10">
                <HelpCircle className="w-5 h-5 text-info" />
              </div>
              <div>
                <p className="text-2xl font-bold">78%</p>
                <p className="text-sm text-muted-foreground">Resolução automática</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="config" className="space-y-6">
        <TabsList>
          <TabsTrigger value="config">Configurações</TabsTrigger>
          <TabsTrigger value="training">Base de Conhecimento</TabsTrigger>
          <TabsTrigger value="logs">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Modelo de IA</CardTitle>
                <CardDescription>Escolha o modelo de inteligência artificial</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Provedor e Modelo</Label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      {aiModels.map((model) => (
                        <SelectItem key={model.value} value={model.value}>
                          <span className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {model.provider}
                            </Badge>
                            {model.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Gemini Flash é mais rápido e econômico. GPT-5 é mais preciso para tarefas complexas.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Personalidade do Bot</CardTitle>
                <CardDescription>Configure como a IA deve se comportar</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Prompt do Sistema</Label>
                  <Textarea
                    placeholder="Você é um assistente virtual amigável e profissional..."
                    rows={6}
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                  />
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Criatividade</Label>
                    <span className="text-sm text-muted-foreground">{creativity[0]}%</span>
                  </div>
                  <Slider
                    value={creativity}
                    onValueChange={setCreativity}
                    max={100}
                    step={1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Valores mais baixos = respostas mais consistentes. Valores mais altos = respostas mais variadas.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Regras de Atuação</CardTitle>
                <CardDescription>Quando a IA deve responder automaticamente</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: "Responder fora do horário comercial", enabled: true },
                    { label: "Responder perguntas frequentes", enabled: true },
                    { label: "Coletar informações iniciais", enabled: true },
                    { label: "Encaminhar para fila correta", enabled: false },
                    { label: "Sugerir respostas para atendentes", enabled: true },
                    { label: "Responder automaticamente em filas específicas", enabled: false },
                  ].map((rule, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg border border-border">
                      <span className="text-sm">{rule.label}</span>
                      <Switch defaultChecked={rule.enabled} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="training" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Base de Conhecimento</CardTitle>
              <CardDescription>
                Adicione informações para a IA usar nas respostas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Informações da Empresa</Label>
                <Textarea
                  placeholder="Adicione informações sobre sua empresa, produtos, serviços..."
                  rows={12}
                  value={knowledgeBase}
                  onChange={(e) => setKnowledgeBase(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Retreinar IA
                </Button>
                <Button className="gap-2" onClick={handleSave} disabled={updateSettings.isPending}>
                  {updateSettings.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Save className="w-4 h-4" />
                  Salvar Base
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Últimas Interações</CardTitle>
              <CardDescription>Histórico de respostas da IA</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { time: "10:32", question: "Qual o horário de funcionamento?", answer: "Nosso horário é de segunda a sexta, das 8h às 18h.", confidence: 98 },
                  { time: "10:28", question: "Quanto custa o plano básico?", answer: "O Plano Básico custa R$ 99/mês e inclui...", confidence: 95 },
                  { time: "10:15", question: "Quero falar com um atendente", answer: "Claro! Estou transferindo você para nossa equipe.", confidence: 100 },
                  { time: "10:02", question: "Vocês aceitam PIX?", answer: "Sim! Aceitamos PIX, cartão de crédito e boleto.", confidence: 92 },
                ].map((log, index) => (
                  <div key={index} className="p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">{log.time}</span>
                      <Badge className={log.confidence >= 95 ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}>
                        {log.confidence}% confiança
                      </Badge>
                    </div>
                    <p className="font-medium text-sm mb-1">Pergunta: {log.question}</p>
                    <p className="text-sm text-muted-foreground">Resposta: {log.answer}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
