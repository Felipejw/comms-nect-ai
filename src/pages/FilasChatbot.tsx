import { useState } from "react";
import { Plus, Search, Users, MoreHorizontal, Play, Pause, Edit, Trash2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueues, useCreateQueue, useUpdateQueue, useDeleteQueue } from "@/hooks/useQueues";
import { toast } from "sonner";

export default function FilasChatbot() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isQueueDialogOpen, setIsQueueDialogOpen] = useState(false);
  const [isEditQueueDialogOpen, setIsEditQueueDialogOpen] = useState(false);
  const [isDeleteQueueDialogOpen, setIsDeleteQueueDialogOpen] = useState(false);

  // Queue form state
  const [queueName, setQueueName] = useState("");
  const [queueDescription, setQueueDescription] = useState("");
  const [queueColor, setQueueColor] = useState("#3B82F6");
  const [selectedQueue, setSelectedQueue] = useState<{ id: string; name: string; description: string | null; color: string | null } | null>(null);

  const { data: queues = [], isLoading: queuesLoading } = useQueues();
  const createQueue = useCreateQueue();
  const updateQueue = useUpdateQueue();
  const deleteQueue = useDeleteQueue();

  const filteredQueues = queues.filter(q => 
    q.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Queue handlers
  const handleCreateQueue = async () => {
    if (!queueName.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    await createQueue.mutateAsync({
      name: queueName.trim(),
      description: queueDescription.trim() || undefined,
      color: queueColor,
    });
    setQueueName("");
    setQueueDescription("");
    setQueueColor("#3B82F6");
    setIsQueueDialogOpen(false);
  };

  const handleUpdateQueue = async () => {
    if (!selectedQueue || !queueName.trim()) return;
    await updateQueue.mutateAsync({
      id: selectedQueue.id,
      name: queueName.trim(),
      description: queueDescription.trim() || undefined,
      color: queueColor,
    });
    setIsEditQueueDialogOpen(false);
    setSelectedQueue(null);
  };

  const handleDeleteQueue = async () => {
    if (!selectedQueue) return;
    await deleteQueue.mutateAsync(selectedQueue.id);
    setIsDeleteQueueDialogOpen(false);
    setSelectedQueue(null);
  };

  const handleToggleQueueStatus = async (queue: { id: string; status: string }) => {
    const newStatus = queue.status === "active" ? "paused" : "active";
    await updateQueue.mutateAsync({ id: queue.id, status: newStatus as "active" | "paused" });
  };

  const openEditQueueDialog = (queue: { id: string; name: string; description: string | null; color: string | null }) => {
    setSelectedQueue(queue);
    setQueueName(queue.name);
    setQueueDescription(queue.description || "");
    setQueueColor(queue.color || "#3B82F6");
    setIsEditQueueDialogOpen(true);
  };

  const openDeleteQueueDialog = (queue: { id: string; name: string; description: string | null; color: string | null }) => {
    setSelectedQueue(queue);
    setIsDeleteQueueDialogOpen(true);
  };

  if (queuesLoading) {
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
          <h2 className="text-2xl font-bold">Setores</h2>
          <p className="text-muted-foreground">Configure os setores de atendimento</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar setores..." 
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button className="gap-2" onClick={() => setIsQueueDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            Novo Setor
          </Button>
        </div>

          {filteredQueues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum setor encontrado</h3>
              <p className="text-muted-foreground mb-4">Crie setores como "Comercial", "Vendas", "Suporte"</p>
              <Button onClick={() => setIsQueueDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Setor
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredQueues.map((queue) => (
                <Card key={queue.id} className="animate-fade-in">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: queue.color || "#3B82F6" }}
                        />
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            {queue.name}
                            <Badge className={queue.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>
                              {queue.status === "active" ? "Ativo" : "Pausado"}
                            </Badge>
                          </CardTitle>
                          <CardDescription>{queue.description || "Sem descrição"}</CardDescription>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditQueueDialog(queue)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleQueueStatus(queue)}>
                            {queue.status === "active" ? (
                              <>
                                <Pause className="w-4 h-4 mr-2" />
                                Pausar
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4 mr-2" />
                                Ativar
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => openDeleteQueueDialog(queue)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Atribuição automática</span>
                      <Badge variant="secondary">{queue.auto_assign ? "Sim" : "Não"}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
      </div>

      {/* Create Queue Dialog */}
      <Dialog open={isQueueDialogOpen} onOpenChange={setIsQueueDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Setor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do Setor *</Label>
              <Input 
                placeholder="Ex: Comercial, Vendas, Suporte"
                value={queueName}
                onChange={(e) => setQueueName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea 
                placeholder="Descrição do setor"
                value={queueDescription}
                onChange={(e) => setQueueDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={queueColor}
                  onChange={(e) => setQueueColor(e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={queueColor}
                  onChange={(e) => setQueueColor(e.target.value)}
                  placeholder="#3B82F6"
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsQueueDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateQueue} disabled={createQueue.isPending}>
              {createQueue.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar Setor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Queue Dialog */}
      <Dialog open={isEditQueueDialogOpen} onOpenChange={setIsEditQueueDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Setor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do Setor *</Label>
              <Input 
                value={queueName}
                onChange={(e) => setQueueName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea 
                value={queueDescription}
                onChange={(e) => setQueueDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={queueColor}
                  onChange={(e) => setQueueColor(e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={queueColor}
                  onChange={(e) => setQueueColor(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditQueueDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateQueue} disabled={updateQueue.isPending}>
              {updateQueue.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Queue Dialog */}
      <AlertDialog open={isDeleteQueueDialogOpen} onOpenChange={setIsDeleteQueueDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir setor?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o setor "{selectedQueue?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button 
              variant="destructive" 
              onClick={handleDeleteQueue}
              disabled={deleteQueue.isPending}
            >
              {deleteQueue.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}