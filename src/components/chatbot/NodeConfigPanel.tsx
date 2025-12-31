import { useEffect, useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueues } from "@/hooks/useQueues";
import type { Node } from "@xyflow/react";

interface NodeConfigPanelProps {
  node: Node | null;
  onClose: () => void;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
}

export function NodeConfigPanel({ node, onClose, onUpdate }: NodeConfigPanelProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const { data: queues } = useQueues();

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
          </>
        );

      case "message":
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
          </>
        );

      case "condition":
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
              <Label>Campo para verificar</Label>
              <Select
                value={(formData.field as string) || ""}
                onValueChange={(v) => handleChange("field", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tag">Tag</SelectItem>
                  <SelectItem value="variable">Variável</SelectItem>
                  <SelectItem value="time">Horário</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Operador</Label>
              <Select
                value={(formData.operator as string) || ""}
                onValueChange={(v) => handleChange("operator", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">Igual a</SelectItem>
                  <SelectItem value="contains">Contém</SelectItem>
                  <SelectItem value="greater">Maior que</SelectItem>
                  <SelectItem value="less">Menor que</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                value={(formData.value as string) || ""}
                onChange={(e) => handleChange("value", e.target.value)}
                placeholder="Valor para comparar"
              />
            </div>
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

      case "transfer":
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
      condition: "Configurar Condição",
      delay: "Configurar Aguardar",
      menu: "Configurar Menu",
      transfer: "Configurar Transferência",
      end: "Configurar Encerramento",
    };
    return titles[node.type || ""] || "Configurar Bloco";
  };

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold">{getTitle()}</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">{renderFields()}</div>
      </ScrollArea>
    </div>
  );
}
