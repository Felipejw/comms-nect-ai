import { useState } from "react";
import { Plus, Search, Edit, Trash2, Tag, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Label } from "@/components/ui/label";
import { useTags, useCreateTag, useUpdateTag, useDeleteTag, Tag as TagType } from "@/hooks/useTags";
import { useAuth } from "@/contexts/AuthContext";
import { ReadOnlyBadge } from "@/components/ui/ReadOnlyBadge";

const colorOptions = [
  { name: "Vermelho", value: "#EF4444" },
  { name: "Laranja", value: "#F97316" },
  { name: "Amarelo", value: "#EAB308" },
  { name: "Verde", value: "#22C55E" },
  { name: "Azul", value: "#3B82F6" },
  { name: "Roxo", value: "#A855F7" },
  { name: "Rosa", value: "#EC4899" },
  { name: "Ciano", value: "#06B6D4" },
];

export default function Tags() {
  const { hasPermission, isAdmin } = useAuth();
  const canEdit = isAdmin || hasPermission('tags', 'edit');
  
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagType | null>(null);
  const [deleteTag, setDeleteTag] = useState<TagType | null>(null);
  const [formData, setFormData] = useState({ name: "", color: "#3B82F6", description: "" });

  const { data: tags, isLoading, isError, error, refetch } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTagMutation = useDeleteTag();

  const filteredTags = (tags || []).filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenCreate = () => {
    setEditingTag(null);
    setFormData({ name: "", color: "#3B82F6", description: "" });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (tag: TagType) => {
    setEditingTag(tag);
    setFormData({ name: tag.name, color: tag.color, description: tag.description || "" });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;

    if (editingTag) {
      await updateTag.mutateAsync({
        id: editingTag.id,
        name: formData.name.trim(),
        color: formData.color,
        description: formData.description.trim() || undefined,
      });
    } else {
      await createTag.mutateAsync({
        name: formData.name.trim(),
        color: formData.color,
        description: formData.description.trim() || undefined,
      });
    }
    setIsDialogOpen(false);
    setEditingTag(null);
    setFormData({ name: "", color: "#3B82F6", description: "" });
  };

  const handleDelete = async () => {
    if (!deleteTag) return;
    await deleteTagMutation.mutateAsync(deleteTag.id);
    setDeleteTag(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive font-medium">Erro ao carregar tags</p>
        <p className="text-sm text-muted-foreground max-w-md text-center">{error?.message}</p>
        <Button variant="outline" onClick={() => refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold">Tags</h2>
            <p className="text-muted-foreground">Organize seus contatos com tags personalizadas</p>
          </div>
          {!canEdit && <ReadOnlyBadge />}
        </div>
        <Button className="gap-2" onClick={handleOpenCreate} disabled={!canEdit}>
          <Plus className="w-4 h-4" />
          Nova Tag
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar tags..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filteredTags.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <Tag className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-lg font-medium">Nenhuma tag encontrada</p>
          <p className="text-sm">Crie sua primeira tag para organizar seus contatos</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredTags.map((tag) => (
            <div
              key={tag.id}
              className="bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow animate-fade-in"
            >
              <div className="flex items-start justify-between mb-3">
                <Badge style={{ backgroundColor: tag.color }} className="text-white">
                  <Tag className="w-3 h-3 mr-1" />
                  {tag.name}
                </Badge>
                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-8 h-8"
                    onClick={() => handleOpenEdit(tag)}
                    disabled={!canEdit}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-8 h-8 text-destructive"
                    onClick={() => setDeleteTag(tag)}
                    disabled={!canEdit}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {tag.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {tag.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTag ? "Editar Tag" : "Criar Tag"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome da Tag</Label>
              <Input 
                placeholder="Ex: Cliente VIP" 
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Input 
                placeholder="Descrição da tag" 
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setFormData(prev => ({ ...prev, color: color.value }))}
                    style={{ backgroundColor: color.value }}
                    className={`w-8 h-8 rounded-full transition-all ${
                      formData.color === color.value
                        ? "ring-2 ring-offset-2 ring-primary scale-110"
                        : "hover:scale-105"
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="pt-2">
              <Label>Preview</Label>
              <div className="mt-2">
                <Badge style={{ backgroundColor: formData.color }} className="text-white">
                  <Tag className="w-3 h-3 mr-1" />
                  {formData.name || "Nova Tag"}
                </Badge>
              </div>
            </div>
            <Button 
              className="w-full" 
              onClick={handleSave}
              disabled={!formData.name.trim() || createTag.isPending || updateTag.isPending}
            >
              {(createTag.isPending || updateTag.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingTag ? "Salvar Alterações" : "Criar Tag"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTag} onOpenChange={() => setDeleteTag(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Tag</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a tag "{deleteTag?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTagMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
