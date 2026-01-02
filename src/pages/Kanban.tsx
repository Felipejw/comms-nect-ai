import { useState, useRef } from "react";
import { Plus, MoreHorizontal, Clock, User, Edit, Trash2, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
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
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  useKanbanColumns,
  useKanbanConversations,
  useCreateKanbanColumn,
  useUpdateKanbanColumn,
  useDeleteKanbanColumn,
  useMoveConversationToColumn,
  KanbanColumn,
  KanbanConversation,
} from "@/hooks/useKanban";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ReadOnlyBadge } from "@/components/ui/ReadOnlyBadge";

const priorityConfig = {
  0: { label: "Baixa", className: "bg-muted text-muted-foreground" },
  1: { label: "Média", className: "bg-warning/10 text-warning" },
  2: { label: "Alta", className: "bg-destructive/10 text-destructive" },
};

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "agora";
  if (diffMins < 60) return `${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

export default function Kanban() {
  const { hasPermission, isAdmin } = useAuth();
  const canEdit = isAdmin || hasPermission('kanban', 'edit');
  
  const { data: columns = [], isLoading: columnsLoading } = useKanbanColumns();
  const { data: conversations = [], isLoading: conversationsLoading } = useKanbanConversations();
  const createColumn = useCreateKanbanColumn();
  const updateColumn = useUpdateKanbanColumn();
  const deleteColumn = useDeleteKanbanColumn();
  const moveConversation = useMoveConversationToColumn();
  const navigate = useNavigate();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<KanbanColumn | null>(null);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnColor, setNewColumnColor] = useState("#3B82F6");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCreateColumn = async () => {
    if (!newColumnName.trim()) return;
    await createColumn.mutateAsync({
      name: newColumnName.trim(),
      color: newColumnColor,
      position: columns.length,
    });
    setNewColumnName("");
    setNewColumnColor("#3B82F6");
    setIsCreateDialogOpen(false);
  };

  const handleUpdateColumn = async () => {
    if (!selectedColumn || !newColumnName.trim()) return;
    await updateColumn.mutateAsync({
      id: selectedColumn.id,
      name: newColumnName.trim(),
      color: newColumnColor,
    });
    setIsEditDialogOpen(false);
    setSelectedColumn(null);
  };

  const handleDeleteColumn = async () => {
    if (!selectedColumn) return;
    setIsDeleting(true);
    try {
      await deleteColumn.mutateAsync(selectedColumn.id);
      setIsDeleteDialogOpen(false);
      setSelectedColumn(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditDialog = (column: KanbanColumn) => {
    setSelectedColumn(column);
    setNewColumnName(column.name);
    setNewColumnColor(column.color);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (column: KanbanColumn) => {
    setSelectedColumn(column);
    setIsDeleteDialogOpen(true);
  };

  const getConversationsForColumn = (columnId: string) => {
    return conversations.filter(c => c.kanban_column_id === columnId);
  };

  const getUnassignedConversations = () => {
    const columnIds = columns.map(c => c.id);
    return conversations.filter(c => !c.kanban_column_id || !columnIds.includes(c.kanban_column_id));
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!canEdit) return; // Prevent dragging if user doesn't have edit permission
    
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const targetColumnId = destination.droppableId === "unassigned" ? null : destination.droppableId;

    await moveConversation.mutateAsync({
      conversationId: draggableId,
      columnId: targetColumnId,
    });
  };

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -350, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 350, behavior: "smooth" });
    }
  };

  const isLoading = columnsLoading || conversationsLoading;

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
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold">Kanban de Conversas</h2>
            <p className="text-muted-foreground">Arraste as conversas entre as colunas</p>
          </div>
          {!canEdit && <ReadOnlyBadge />}
        </div>
        <Button className="gap-2" onClick={() => setIsCreateDialogOpen(true)} disabled={!canEdit}>
          <Plus className="w-4 h-4" />
          Nova Coluna
        </Button>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="relative">
          {/* Scroll buttons */}
          <Button
            variant="outline"
            size="icon"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-background shadow-md"
            onClick={scrollLeft}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-background shadow-md"
            onClick={scrollRight}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          <div 
            ref={scrollContainerRef}
            className="flex gap-6 overflow-x-auto pb-4 px-10 scrollbar-thin scroll-smooth"
            style={{ scrollbarWidth: "thin" }}
          >
            {/* Unassigned column */}
            {getUnassignedConversations().length > 0 && (
              <div className="kanban-column min-w-[320px] flex-shrink-0 opacity-70">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-muted" />
                    <h3 className="font-semibold">Sem Coluna</h3>
                    <Badge variant="secondary" className="ml-1">
                      {getUnassignedConversations().length}
                    </Badge>
                  </div>
                </div>

                <Droppable droppableId="unassigned">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "space-y-3 min-h-[100px] max-h-[calc(100vh-280px)] overflow-y-auto rounded-lg transition-colors pr-1 scrollbar-thin",
                        snapshot.isDraggingOver && "bg-muted/50"
                      )}
                    >
                      {getUnassignedConversations().map((conv, index) => (
                        <Draggable key={conv.id} draggableId={conv.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              style={provided.draggableProps.style}
                            >
                              <ConversationCard
                                conversation={conv}
                                isDragging={snapshot.isDragging}
                                onClick={() => navigate("/atendimento")}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            )}

            {columns.map((column) => (
              <div key={column.id} className="kanban-column min-w-[320px] flex-shrink-0">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.color }} />
                    <h3 className="font-semibold">{column.name}</h3>
                    <Badge variant="secondary" className="ml-1">
                      {getConversationsForColumn(column.id).length}
                    </Badge>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="w-8 h-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(column)} disabled={!canEdit}>
                        <Edit className="w-4 h-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openDeleteDialog(column)}
                        className="text-destructive"
                        disabled={!canEdit}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "space-y-3 min-h-[100px] max-h-[calc(100vh-280px)] overflow-y-auto rounded-lg transition-colors pr-1 scrollbar-thin",
                        snapshot.isDraggingOver && "bg-primary/5 ring-2 ring-primary/20"
                      )}
                    >
                      {getConversationsForColumn(column.id).map((conv, index) => (
                        <Draggable key={conv.id} draggableId={conv.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              style={provided.draggableProps.style}
                            >
                              <ConversationCard
                                conversation={conv}
                                isDragging={snapshot.isDragging}
                                onClick={() => navigate("/atendimento")}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </div>
      </DragDropContext>

      {/* Create Column Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Coluna</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                placeholder="Nome da coluna"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={newColumnColor}
                  onChange={(e) => setNewColumnColor(e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={newColumnColor}
                  onChange={(e) => setNewColumnColor(e.target.value)}
                  placeholder="#3B82F6"
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateColumn} disabled={createColumn.isPending}>
              {createColumn.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Column Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Coluna</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                placeholder="Nome da coluna"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={newColumnColor}
                  onChange={(e) => setNewColumnColor(e.target.value)}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={newColumnColor}
                  onChange={(e) => setNewColumnColor(e.target.value)}
                  placeholder="#3B82F6"
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateColumn} disabled={updateColumn.isPending}>
              {updateColumn.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Column Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir coluna?</AlertDialogTitle>
            <AlertDialogDescription>
              As conversas desta coluna serão movidas para "Sem Coluna". Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <Button 
              variant="destructive" 
              onClick={handleDeleteColumn}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConversationCard({
  conversation,
  isDragging,
  onClick,
}: {
  conversation: KanbanConversation;
  isDragging: boolean;
  onClick: () => void;
}) {
  const priority = Math.min(conversation.priority, 2) as 0 | 1 | 2;

  return (
    <div
      onClick={onClick}
      className={cn(
        "kanban-card animate-fade-in cursor-pointer transition-all",
        isDragging && "shadow-lg ring-2 ring-primary rotate-2 scale-105"
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Avatar className="w-8 h-8">
            <AvatarImage src={conversation.contact?.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {conversation.contact?.name?.split(" ").map((n) => n[0]).join("") || "?"}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-sm">{conversation.contact?.name || "Desconhecido"}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatRelativeTime(conversation.last_message_at)}
            </p>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
        {conversation.subject || "Sem assunto"}
      </p>

      {conversation.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {conversation.tags.slice(0, 3).map((tag) => (
            <Badge
              key={tag.id}
              style={{ backgroundColor: tag.color }}
              className="text-white text-xs"
            >
              {tag.name}
            </Badge>
          ))}
          {conversation.tags.length > 3 && (
            <Badge variant="secondary" className="text-xs">
              +{conversation.tags.length - 3}
            </Badge>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-border">
        <Badge className={cn("text-xs", priorityConfig[priority].className)}>
          {priorityConfig[priority].label}
        </Badge>
        {conversation.assignee && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <User className="w-3 h-3" />
            {conversation.assignee.name.split(" ")[0]}
          </div>
        )}
      </div>
    </div>
  );
}