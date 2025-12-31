import { useState } from "react";
import { Plus, Search, Edit, Trash2, Copy, Zap, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
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
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useQuickReplies, useCreateQuickReply, useDeleteQuickReply } from "@/hooks/useQuickReplies";

const defaultCategories = ["Todas", "Saudações", "Atendimento", "Logística", "Suporte"];

export default function RespostasRapidas() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    shortcut: "",
    title: "",
    message: "",
    category: "",
  });

  const { data: quickReplies, isLoading } = useQuickReplies();
  const createQuickReply = useCreateQuickReply();
  const deleteQuickReply = useDeleteQuickReply();

  // Get unique categories from data
  const categories = ["Todas", ...new Set(quickReplies?.map(r => r.category).filter(Boolean) as string[])];

  const filteredReplies = quickReplies?.filter((r) => {
    const matchesSearch =
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.shortcut.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "Todas" || r.category === selectedCategory;
    return matchesSearch && matchesCategory;
  }) || [];

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Mensagem copiada!");
  };

  const handleCreate = async () => {
    if (!formData.shortcut || !formData.title || !formData.message) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const shortcut = formData.shortcut.startsWith('/') ? formData.shortcut : `/${formData.shortcut}`;
    
    await createQuickReply.mutateAsync({
      shortcut,
      title: formData.title,
      message: formData.message,
      category: formData.category || undefined,
    });
    
    setFormData({ shortcut: "", title: "", message: "", category: "" });
    setIsDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteQuickReply.mutateAsync(deleteId);
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Respostas Rápidas</h2>
          <p className="text-muted-foreground">Crie atalhos para agilizar seus atendimentos</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Nova Resposta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Resposta Rápida</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Atalho *</Label>
                  <Input 
                    placeholder="/atalho" 
                    value={formData.shortcut}
                    onChange={(e) => setFormData(prev => ({ ...prev, shortcut: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Input 
                    placeholder="Ex: Saudações" 
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input 
                  placeholder="Título da resposta" 
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Mensagem *</Label>
                <Textarea 
                  placeholder="Digite a mensagem..." 
                  rows={4} 
                  value={formData.message}
                  onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                />
              </div>
              <Button 
                className="w-full" 
                onClick={handleCreate}
                disabled={createQuickReply.isPending}
              >
                {createQuickReply.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  "Criar Resposta"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar respostas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(categories.length > 1 ? categories : defaultCategories).map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredReplies.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Zap className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Nenhuma resposta rápida cadastrada</p>
          <p className="text-sm mt-1">Clique em "Nova Resposta" para criar sua primeira resposta rápida</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredReplies.map((reply) => (
            <div
              key={reply.id}
              className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow animate-fade-in"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono">
                    {reply.shortcut}
                  </Badge>
                  {reply.category && (
                    <Badge variant="outline">{reply.category}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8"
                    onClick={() => copyToClipboard(reply.message)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8">
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-8 h-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(reply.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <h4 className="font-medium mb-2">{reply.title}</h4>
              <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                {reply.message}
              </p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Zap className="w-3 h-3" />
                Usado {reply.usage_count || 0} vezes
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir resposta rápida?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A resposta rápida será permanentemente excluída.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteQuickReply.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
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
