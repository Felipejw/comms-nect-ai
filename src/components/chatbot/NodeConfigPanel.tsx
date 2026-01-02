import { useEffect, useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQueues } from "@/hooks/useQueues";
import { useUsers } from "@/hooks/useUsers";
import { useWhatsAppConnections } from "@/hooks/useWhatsAppConnections";
import { useKanbanColumns } from "@/hooks/useKanbanColumns";
import type { Node } from "@xyflow/react";

interface NodeConfigPanelProps {
  node: Node | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onDelete?: (nodeId: string) => void;
  onSaveFlow?: () => void;
  isSaving?: boolean;
}

const AI_MODELS = [
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (Recomendado)" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "openai/gpt-5", label: "GPT-5" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano" },
];

export function NodeConfigPanel({ node, open, onClose, onUpdate, onDelete, onSaveFlow, isSaving }: NodeConfigPanelProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const { data: queues } = useQueues();
  const { data: users } = useUsers();
  const { connections } = useWhatsAppConnections();
  const { data: kanbanColumns } = useKanbanColumns();

  useEffect(() => {
    if (node) {
      setFormData(node.data as Record<string, unknown>);
    }
  }, [node]);

  if (!node) return null;

  const handleChange = (key: string, value: unknown) => {
    const newData = { ...formData, [key]: value };
    setFormData(newData);
    onUpdate(node.id, newData);
  };

  const handleAddOption = () => {
    const options = (formData.options as Array<{ id: string; text: string }>) || [];
    const newOption = { id: `opt_${Date.now()}`, text: "" };
    handleChange("options", [...options, newOption]);
  };

  const handleRemoveOption = (optionId: string) => {
    const options = (formData.options as Array<{ id: string; text: string }>) || [];
    handleChange("options", options.filter((o) => o.id !== optionId));
  };

  const handleOptionChange = (optionId: string, text: string) => {
    const options = (formData.options as Array<{ id: string; text: string }>) || [];
    handleChange(
      "options",
      options.map((o) => (o.id === optionId ? { ...o, text } : o))
    );
  };

  const renderFields = () => {
    switch (node.type) {
      case "trigger":
        return (
          <>
            <div className="space-y-2">
              <Label>Nome do bloco</Label>
              <Input
                value={(formData.label as string) || ""}
                onChange={(e) => handleChange("label", e.target.value)}
                placeholder="Gatilho"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de gatilho</Label>
              <Select
                value={(formData.triggerType as string) || "keyword"}
                onValueChange={(v) => handleChange("triggerType", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">Palavra-chave</SelectItem>
                  <SelectItem value="phrase">Frase</SelectItem>
                  <SelectItem value="new_conversation">Nova conversa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.triggerType === "keyword" && (
              <div className="space-y-2">
                <Label>Palavra-chave</Label>
                <Input
                  value={(formData.triggerValue as string) || ""}
                  onChange={(e) => handleChange("triggerValue", e.target.value)}
                  placeholder="Ex: oi, olá, menu"
                />
              </div>
            )}
            {formData.triggerType === "phrase" && (
              <div className="space-y-2">
                <Label>Frase</Label>
                <Input
                  value={(formData.triggerValue as string) || ""}
                  onChange={(e) => handleChange("triggerValue", e.target.value)}
                  placeholder="Ex: quero fazer um pedido"
                />
                <p className="text-xs text-muted-foreground">
                  A frase será comparada parcialmente com a mensagem do usuário
                </p>
              </div>
            )}
          </>
        );

      case "message":
        const messageType = (formData.messageType as string) || "text";
        return (
          <>
            <div className="space-y-2">
              <Label>Nome do bloco</Label>
              <Input
                value={(formData.label as string) || ""}
                onChange={(e) => handleChange("label", e.target.value)}
                placeholder="Mensagem"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de mensagem</Label>
              <Select
                value={messageType}
                onValueChange={(v) => handleChange("messageType", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="image">Imagem</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                  <SelectItem value="document">Documento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {messageType === "text" && (
              <div className="space-y-2">
                <Label>Conteúdo da mensagem</Label>
                <Textarea
                  value={(formData.content as string) || ""}
                  onChange={(e) => handleChange("content", e.target.value)}
                  placeholder="Digite a mensagem que será enviada..."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Use {"{{nome}}"} para inserir variáveis
                </p>
              </div>
            )}
            {(messageType === "image" || messageType === "video" || messageType === "document") && (
              <>
                <div className="space-y-2">
                  <Label>URL do arquivo</Label>
                  <Input
                    value={(formData.mediaUrl as string) || ""}
                    onChange={(e) => handleChange("mediaUrl", e.target.value)}
                    placeholder={`https://exemplo.com/${messageType === "image" ? "imagem.jpg" : messageType === "video" ? "video.mp4" : "documento.pdf"}`}
                  />
                  <p className="text-xs text-muted-foreground">
                    Cole a URL direta do arquivo de mídia
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Legenda (opcional)</Label>
                  <Textarea
                    value={(formData.caption as string) || ""}
                    onChange={(e) => handleChange("caption", e.target.value)}
                    placeholder="Digite uma legenda para a mídia..."
                    rows={2}
                  />
                </div>
              </>
            )}
          </>
        );



      case "delay":
        return (
          <>
            <div className="space-y-2">
              <Label>Nome do bloco</Label>
              <Input
                value={(formData.label as string) || ""}
                onChange={(e) => handleChange("label", e.target.value)}
                placeholder="Aguardar"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Tempo</Label>
                <Input
                  type="number"
                  min={1}
                  value={(formData.delay as number) || ""}
                  onChange={(e) => handleChange("delay", parseInt(e.target.value))}
                  placeholder="5"
                />
              </div>
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Select
                  value={(formData.unit as string) || "seconds"}
                  onValueChange={(v) => handleChange("unit", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seconds">Segundos</SelectItem>
                    <SelectItem value="minutes">Minutos</SelectItem>
                    <SelectItem value="hours">Horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        );

      case "menu":
        const options = (formData.options as Array<{ id: string; text: string }>) || [];
        return (
          <>
            <div className="space-y-2">
              <Label>Nome do bloco</Label>
              <Input
                value={(formData.label as string) || ""}
                onChange={(e) => handleChange("label", e.target.value)}
                placeholder="Menu"
              />
            </div>
            <div className="space-y-2">
              <Label>Título do menu</Label>
              <Input
                value={(formData.title as string) || ""}
                onChange={(e) => handleChange("title", e.target.value)}
                placeholder="Escolha uma opção:"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Opções</Label>
                <Button variant="ghost" size="sm" onClick={handleAddOption}>
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {options.map((option, index) => (
                  <div key={option.id} className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
                    <Input
                      value={option.text}
                      onChange={(e) => handleOptionChange(option.id, e.target.value)}
                      placeholder={`Opção ${index + 1}`}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleRemoveOption(option.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </>
        );

      case "ai":
        return (
          <>
            <div className="space-y-2">
              <Label>Nome do bloco</Label>
              <Input
                value={(formData.label as string) || ""}
                onChange={(e) => handleChange("label", e.target.value)}
                placeholder="IA"
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="space-y-0.5">
                <Label>Ativar IA</Label>
                <p className="text-xs text-muted-foreground">Responder automaticamente</p>
              </div>
              <Switch
                checked={(formData.isEnabled as boolean) ?? true}
                onCheckedChange={(v) => handleChange("isEnabled", v)}
              />
            </div>
            <div className="space-y-2">
              <Label>Modelo de IA</Label>
              <Select
                value={(formData.model as string) || "google/gemini-2.5-flash"}
                onValueChange={(v) => handleChange("model", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_MODELS.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea
                value={(formData.systemPrompt as string) || ""}
                onChange={(e) => handleChange("systemPrompt", e.target.value)}
                placeholder="Você é um assistente amigável que ajuda os clientes..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Instruções para o comportamento da IA
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Temperatura: {(formData.temperature as number) ?? 0.7}</Label>
              </div>
              <Slider
                value={[(formData.temperature as number) ?? 0.7]}
                onValueChange={(v) => handleChange("temperature", v[0])}
                min={0}
                max={2}
                step={0.1}
              />
              <p className="text-xs text-muted-foreground">
                Menor = mais preciso, Maior = mais criativo
              </p>
            </div>
            <div className="space-y-2">
              <Label>Max Tokens</Label>
              <Input
                type="number"
                min={100}
                max={4096}
                value={(formData.maxTokens as number) || 1024}
                onChange={(e) => handleChange("maxTokens", parseInt(e.target.value))}
                placeholder="1024"
              />
            </div>
            <div className="space-y-2">
              <Label>Base de conhecimento (opcional)</Label>
              <Textarea
                value={(formData.knowledgeBase as string) || ""}
                onChange={(e) => handleChange("knowledgeBase", e.target.value)}
                placeholder="Informações sobre produtos, preços, políticas..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Contexto adicional para a IA consultar
              </p>
            </div>
          </>
        );

      case "crm":
        return (
          <>
            <div className="space-y-2">
              <Label>Nome do bloco</Label>
              <Input
                value={(formData.label as string) || ""}
                onChange={(e) => handleChange("label", e.target.value)}
                placeholder="CRM"
              />
            </div>
            <div className="space-y-2">
              <Label>Etapa do Kanban</Label>
              <Select
                value={(formData.kanbanColumnId as string) || ""}
                onValueChange={(v) => {
                  const column = kanbanColumns?.find((c) => c.id === v);
                  handleChange("kanbanColumnId", v);
                  handleChange("kanbanColumnName", column?.name || "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa..." />
                </SelectTrigger>
                <SelectContent>
                  {kanbanColumns?.map((column) => (
                    <SelectItem key={column.id} value={column.id}>
                      <div className="flex items-center gap-2">
                        {column.color && (
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: column.color }}
                          />
                        )}
                        {column.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O contato será movido para esta etapa do CRM
              </p>
            </div>
          </>
        );

      case "transfer":
        const transferType = (formData.transferType as string) || "queue";
        return (
          <>
            <div className="space-y-2">
              <Label>Nome do bloco</Label>
              <Input
                value={(formData.label as string) || ""}
                onChange={(e) => handleChange("label", e.target.value)}
                placeholder="Transferir"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de transferência</Label>
              <Select
                value={transferType}
                onValueChange={(v) => {
                  handleChange("transferType", v);
                  // Reset related fields
                  handleChange("queueId", "");
                  handleChange("queueName", "");
                  handleChange("agentId", "");
                  handleChange("agentName", "");
                  handleChange("connectionId", "");
                  handleChange("connectionName", "");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="queue">Setor/Fila</SelectItem>
                  <SelectItem value="agent">Atendente específico</SelectItem>
                  <SelectItem value="whatsapp">Número de WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {transferType === "queue" && (
              <div className="space-y-2">
                <Label>Setor/Fila</Label>
                <Select
                  value={(formData.queueId as string) || ""}
                  onValueChange={(v) => {
                    const queue = queues?.find((q) => q.id === v);
                    handleChange("queueId", v);
                    handleChange("queueName", queue?.name || "");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o setor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {queues?.map((queue) => (
                      <SelectItem key={queue.id} value={queue.id}>
                        {queue.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {transferType === "agent" && (
              <div className="space-y-2">
                <Label>Atendente</Label>
                <Select
                  value={(formData.agentId as string) || ""}
                  onValueChange={(v) => {
                    const agent = users?.find((u) => u.id === v);
                    handleChange("agentId", v);
                    handleChange("agentName", agent?.name || "");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o atendente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users?.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${user.is_online ? "bg-success" : "bg-muted"}`} />
                          {user.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {transferType === "whatsapp" && (
              <div className="space-y-2">
                <Label>Número de WhatsApp</Label>
                <Select
                  value={(formData.connectionId as string) || ""}
                  onValueChange={(v) => {
                    const connection = connections?.find((c) => c.id === v);
                    handleChange("connectionId", v);
                    handleChange("connectionName", connection?.name || connection?.phone_number || "");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o número..." />
                  </SelectTrigger>
                  <SelectContent>
                    {connections?.map((conn) => (
                      <SelectItem key={conn.id} value={conn.id}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${conn.status === "connected" ? "bg-success" : "bg-muted"}`} />
                          {conn.name} {conn.phone_number && `(${conn.phone_number})`}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Mensagem de transferência</Label>
              <Textarea
                value={(formData.message as string) || ""}
                onChange={(e) => handleChange("message", e.target.value)}
                placeholder="Você está sendo transferido para..."
                rows={2}
              />
            </div>
          </>
        );

      case "end":
        return (
          <>
            <div className="space-y-2">
              <Label>Nome do bloco</Label>
              <Input
                value={(formData.label as string) || ""}
                onChange={(e) => handleChange("label", e.target.value)}
                placeholder="Encerrar"
              />
            </div>
            <div className="space-y-2">
              <Label>Mensagem de encerramento (opcional)</Label>
              <Textarea
                value={(formData.message as string) || ""}
                onChange={(e) => handleChange("message", e.target.value)}
                placeholder="Obrigado pelo contato!"
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="space-y-0.5">
                <Label>Marcar como resolvido</Label>
                <p className="text-xs text-muted-foreground">Encerrar e resolver a conversa</p>
              </div>
              <Switch
                checked={(formData.markAsResolved as boolean) ?? true}
                onCheckedChange={(v) => handleChange("markAsResolved", v)}
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  const getTitle = () => {
    const titles: Record<string, string> = {
      trigger: "Configurar Gatilho",
      message: "Configurar Mensagem",
      delay: "Configurar Aguardar",
      menu: "Configurar Menu",
      ai: "Configurar IA",
      crm: "Configurar CRM",
      transfer: "Configurar Transferência",
      end: "Configurar Encerramento",
    };
    return titles[node.type || ""] || "Configurar Bloco";
  };

  const handleDelete = () => {
    if (node && onDelete) {
      onDelete(node.id);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="space-y-4">{renderFields()}</div>
        </ScrollArea>
        <div className="pt-4 border-t border-border space-y-2">
          {onSaveFlow && (
            <Button
              className="w-full gap-2"
              onClick={onSaveFlow}
              disabled={isSaving}
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Salvando..." : "Salvar fluxo"}
            </Button>
          )}
          {onDelete && (
            <Button
              variant="destructive"
              className="w-full gap-2"
              onClick={handleDelete}
            >
              <Trash2 className="w-4 h-4" />
              Excluir bloco
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
