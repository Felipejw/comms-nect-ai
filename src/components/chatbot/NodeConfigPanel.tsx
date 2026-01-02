import { useEffect, useState, useRef } from "react";
import { Plus, Trash2, Save, Upload, Loader2, X } from "lucide-react";
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
import { useTags } from "@/hooks/useTags";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: queues } = useQueues();
  const { data: users } = useUsers();
  const { connections } = useWhatsAppConnections();
  const { data: kanbanColumns } = useKanbanColumns();
  const { data: tags } = useTags();

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
                  <Label>Arquivo de mídia</Label>
                  <div className="flex gap-2">
                    <Input
                      value={(formData.mediaUrl as string) || ""}
                      onChange={(e) => handleChange("mediaUrl", e.target.value)}
                      placeholder={`https://exemplo.com/${messageType === "image" ? "imagem.jpg" : messageType === "video" ? "video.mp4" : "documento.pdf"}`}
                      className="flex-1"
                    />
                    {formData.mediaUrl && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleChange("mediaUrl", "")}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept={
                      messageType === "image" 
                        ? "image/*" 
                        : messageType === "video" 
                        ? "video/*" 
                        : "*/*"
                    }
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      setIsUploading(true);
                      try {
                        const fileExt = file.name.split('.').pop();
                        const fileName = `${crypto.randomUUID()}.${fileExt}`;
                        const filePath = `chatbot/${fileName}`;
                        
                        const { error: uploadError } = await supabase.storage
                          .from('whatsapp-media')
                          .upload(filePath, file);
                          
                        if (uploadError) throw uploadError;
                        
                        const { data: { publicUrl } } = supabase.storage
                          .from('whatsapp-media')
                          .getPublicUrl(filePath);
                          
                        handleChange("mediaUrl", publicUrl);
                        toast.success("Arquivo enviado com sucesso!");
                      } catch (error) {
                        console.error("Upload error:", error);
                        toast.error("Erro ao enviar arquivo");
                      } finally {
                        setIsUploading(false);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Fazer upload
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Envie um arquivo ou cole a URL direta
                  </p>
                  {messageType === "image" && formData.mediaUrl && (
                    <div className="mt-2 rounded-lg overflow-hidden border border-border">
                      <img 
                        src={formData.mediaUrl as string} 
                        alt="Preview" 
                        className="w-full h-32 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
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

      case "condition":
        const conditionType = (formData.conditionType as string) || "message";
        return (
          <>
            <div className="space-y-2">
              <Label>Nome do bloco</Label>
              <Input
                value={(formData.label as string) || ""}
                onChange={(e) => handleChange("label", e.target.value)}
                placeholder="Condição"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de condição</Label>
              <Select
                value={conditionType}
                onValueChange={(v) => {
                  handleChange("conditionType", v);
                  // Reset related fields
                  handleChange("field", "");
                  handleChange("operator", "");
                  handleChange("value", "");
                  handleChange("tagId", "");
                  handleChange("tagName", "");
                  handleChange("kanbanColumnId", "");
                  handleChange("kanbanColumnName", "");
                  handleChange("startTime", "");
                  handleChange("endTime", "");
                  handleChange("daysOfWeek", []);
                  handleChange("messageCount", "");
                  handleChange("messageOperator", "");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={5}>
                  <SelectItem value="message">Conteúdo da mensagem</SelectItem>
                  <SelectItem value="tag">Tag do contato</SelectItem>
                  <SelectItem value="kanban">Etapa do CRM</SelectItem>
                  <SelectItem value="business_hours">Horário de atendimento</SelectItem>
                  <SelectItem value="day_of_week">Dia da semana</SelectItem>
                  <SelectItem value="message_count">Quantidade de mensagens</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {conditionType === "message" && (
              <>
                <div className="space-y-2">
                  <Label>Campo</Label>
                  <Select
                    value={(formData.field as string) || "message"}
                    onValueChange={(v) => handleChange("field", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={5}>
                      <SelectItem value="message">Mensagem do usuário</SelectItem>
                      <SelectItem value="contact_name">Nome do contato</SelectItem>
                      <SelectItem value="contact_phone">Telefone do contato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Operador</Label>
                  <Select
                    value={(formData.operator as string) || "contains"}
                    onValueChange={(v) => handleChange("operator", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={5}>
                      <SelectItem value="contains">Contém</SelectItem>
                      <SelectItem value="equals">Igual a</SelectItem>
                      <SelectItem value="not_equals">Diferente de</SelectItem>
                      <SelectItem value="starts_with">Começa com</SelectItem>
                      <SelectItem value="ends_with">Termina com</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valor</Label>
                  <Input
                    value={(formData.value as string) || ""}
                    onChange={(e) => handleChange("value", e.target.value)}
                    placeholder="Texto para comparar..."
                  />
                </div>
              </>
            )}

            {conditionType === "tag" && (
              <div className="space-y-2">
                <Label>Tag</Label>
                <Select
                  value={(formData.tagId as string) || ""}
                  onValueChange={(v) => {
                    const tag = tags?.find((t) => t.id === v);
                    handleChange("tagId", v);
                    handleChange("tagName", tag?.name || "");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a tag..." />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={5}>
                    {tags?.map((tag) => (
                      <SelectItem key={tag.id} value={tag.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          {tag.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Verifica se o contato possui esta tag
                </p>
              </div>
            )}

            {conditionType === "kanban" && (
              <div className="space-y-2">
                <Label>Etapa do CRM</Label>
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
                  <SelectContent position="popper" sideOffset={5}>
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
                  Verifica se a conversa está nesta etapa do CRM
                </p>
              </div>
            )}

            {conditionType === "business_hours" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>Início</Label>
                    <Input
                      type="time"
                      value={(formData.startTime as string) || "09:00"}
                      onChange={(e) => handleChange("startTime", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fim</Label>
                    <Input
                      type="time"
                      value={(formData.endTime as string) || "18:00"}
                      onChange={(e) => handleChange("endTime", e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Verifica se a mensagem foi enviada dentro do horário especificado
                </p>
              </>
            )}

            {conditionType === "day_of_week" && (
              <div className="space-y-2">
                <Label>Dias da semana</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "0", label: "Dom" },
                    { value: "1", label: "Seg" },
                    { value: "2", label: "Ter" },
                    { value: "3", label: "Qua" },
                    { value: "4", label: "Qui" },
                    { value: "5", label: "Sex" },
                    { value: "6", label: "Sáb" },
                  ].map((day) => {
                    const selectedDays = (formData.daysOfWeek as string[]) || [];
                    const isSelected = selectedDays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => {
                          const newDays = isSelected
                            ? selectedDays.filter((d) => d !== day.value)
                            : [...selectedDays, day.value];
                          handleChange("daysOfWeek", newDays);
                        }}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted border-border hover:bg-muted/80"
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Verifica se hoje é um dos dias selecionados
                </p>
              </div>
            )}

            {conditionType === "message_count" && (
              <>
                <div className="space-y-2">
                  <Label>Operador</Label>
                  <Select
                    value={(formData.messageOperator as string) || "greater"}
                    onValueChange={(v) => handleChange("messageOperator", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={5}>
                      <SelectItem value="greater">Maior que</SelectItem>
                      <SelectItem value="less">Menor que</SelectItem>
                      <SelectItem value="equals">Igual a</SelectItem>
                      <SelectItem value="greater_equals">Maior ou igual a</SelectItem>
                      <SelectItem value="less_equals">Menor ou igual a</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantidade de mensagens</Label>
                  <Input
                    type="number"
                    min={0}
                    value={(formData.messageCount as number) || ""}
                    onChange={(e) => handleChange("messageCount", parseInt(e.target.value) || 0)}
                    placeholder="5"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Verifica o número total de mensagens na conversa
                </p>
              </>
            )}

            <div className="mt-4 p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">
                <strong>Sim:</strong> Condição verdadeira → segue pela saída verde<br />
                <strong>Não:</strong> Condição falsa → segue pela saída vermelha
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

      case "whatsapp":
        return (
          <>
            <div className="space-y-2">
              <Label>Nome do bloco</Label>
              <Input
                value={(formData.label as string) || ""}
                onChange={(e) => handleChange("label", e.target.value)}
                placeholder="WhatsApp"
              />
            </div>
            <div className="space-y-2">
              <Label>Número de WhatsApp</Label>
              <Select
                value={(formData.connectionId as string) || ""}
                onValueChange={(v) => {
                  const connection = connections?.find((c) => c.id === v);
                  handleChange("connectionId", v);
                  handleChange("connectionName", connection?.name || "");
                  handleChange("phoneNumber", connection?.phone_number || "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o número..." />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={5}>
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
              <p className="text-xs text-muted-foreground">
                Define qual número de WhatsApp será usado nesta parte do fluxo
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
                <SelectContent position="popper" sideOffset={5}>
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
                  <SelectContent position="popper" sideOffset={5}>
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
                  <SelectContent position="popper" sideOffset={5}>
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
                  <SelectContent position="popper" sideOffset={5}>
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
      whatsapp: "Configurar WhatsApp",
      delay: "Configurar Aguardar",
      menu: "Configurar Menu",
      ai: "Configurar IA",
      condition: "Configurar Condição",
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
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{getTitle()}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-0 pr-4 -mr-4">
          <div className="space-y-4 pb-2 pr-4">{renderFields()}</div>
        </ScrollArea>
        <div className="pt-4 border-t border-border space-y-2 flex-shrink-0">
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
