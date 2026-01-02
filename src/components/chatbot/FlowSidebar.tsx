import { useState } from "react";
import { Plus, Search, Trash2, Power, PowerOff, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFlows, useCreateFlow, useDeleteFlow, useUpdateFlow, type ChatbotFlow } from "@/hooks/useFlows";
import { cn } from "@/lib/utils";

interface FlowSidebarProps {
  selectedFlowId: string | null;
  onSelectFlow: (id: string | null) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function FlowSidebar({ selectedFlowId, onSelectFlow, collapsed = false, onToggleCollapse }: FlowSidebarProps) {
  const [search, setSearch] = useState("");
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowDesc, setNewFlowDesc] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: flows, isLoading } = useFlows();
  const createFlow = useCreateFlow();
  const deleteFlow = useDeleteFlow();
  const updateFlow = useUpdateFlow();

  const filteredFlows = flows?.filter((flow) =>
    flow.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateFlow = async () => {
    if (!newFlowName.trim()) return;
    
    const result = await createFlow.mutateAsync({
      name: newFlowName,
      description: newFlowDesc || undefined,
    });
    
    setNewFlowName("");
    setNewFlowDesc("");
    setDialogOpen(false);
    if (result?.id) {
      onSelectFlow(result.id);
    }
  };

  const handleDeleteFlow = async (id: string) => {
    if (selectedFlowId === id) {
      onSelectFlow(null);
    }
    await deleteFlow.mutateAsync(id);
  };

  const handleToggleActive = async (flow: ChatbotFlow, e: React.MouseEvent) => {
    e.stopPropagation();
    await updateFlow.mutateAsync({
      id: flow.id,
      is_active: !flow.is_active,
    });
  };

  // When collapsed, show a minimal version
  if (collapsed) {
    return (
      <div className="w-12 border-r border-border bg-card flex flex-col h-full items-center py-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              className="mb-4"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Expandir fluxos</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="icon" variant="ghost">
                  <Plus className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Novo Fluxo</DialogTitle>
                  <DialogDescription>
                    Crie um novo fluxo de automação para seu chatbot.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do fluxo</Label>
                    <Input
                      id="name"
                      placeholder="Ex: Boas-vindas"
                      value={newFlowName}
                      onChange={(e) => setNewFlowName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="desc">Descrição (opcional)</Label>
                    <Textarea
                      id="desc"
                      placeholder="Descreva o objetivo deste fluxo..."
                      value={newFlowDesc}
                      onChange={(e) => setNewFlowDesc(e.target.value)}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleCreateFlow}
                    disabled={!newFlowName.trim() || createFlow.isPending}
                  >
                    Criar Fluxo
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </TooltipTrigger>
          <TooltipContent side="right">Novo fluxo</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-border bg-card flex flex-col h-full">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onToggleCollapse}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h3 className="font-semibold">Fluxos</h3>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="w-4 h-4" />
                Novo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Fluxo</DialogTitle>
                <DialogDescription>
                  Crie um novo fluxo de automação para seu chatbot.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do fluxo</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Boas-vindas"
                    value={newFlowName}
                    onChange={(e) => setNewFlowName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="desc">Descrição (opcional)</Label>
                  <Textarea
                    id="desc"
                    placeholder="Descreva o objetivo deste fluxo..."
                    value={newFlowDesc}
                    onChange={(e) => setNewFlowDesc(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreateFlow}
                  disabled={!newFlowName.trim() || createFlow.isPending}
                >
                  Criar Fluxo
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar fluxo..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              Carregando...
            </div>
          ) : filteredFlows?.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              {search ? "Nenhum fluxo encontrado" : "Nenhum fluxo criado"}
            </div>
          ) : (
            filteredFlows?.map((flow) => (
              <div
                key={flow.id}
                onClick={() => onSelectFlow(flow.id)}
                className={`p-3 rounded-lg cursor-pointer transition-colors group ${
                  selectedFlowId === flow.id
                    ? "bg-primary/10 border border-primary/20"
                    : "hover:bg-muted"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm truncate flex-1">
                    {flow.name}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => handleToggleActive(flow, e)}
                    >
                      {flow.is_active ? (
                        <Power className="w-3.5 h-3.5 text-success" />
                      ) : (
                        <PowerOff className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir fluxo?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. O fluxo "{flow.name}" será excluído permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteFlow(flow.id)}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={flow.is_active ? "default" : "secondary"}
                    className={`text-[10px] px-1.5 py-0 ${
                      flow.is_active ? "bg-success/10 text-success" : ""
                    }`}
                  >
                    {flow.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                  {flow.description && (
                    <span className="text-xs text-muted-foreground truncate">
                      {flow.description}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
