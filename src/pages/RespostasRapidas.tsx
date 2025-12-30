import { useState } from "react";
import { Plus, Search, Edit, Trash2, Copy, Zap } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  message: string;
  category: string;
  usageCount: number;
}

const quickReplies: QuickReply[] = [
  {
    id: "1",
    shortcut: "/ola",
    title: "Saudação inicial",
    message: "Olá! Seja bem-vindo(a) ao nosso atendimento. Como posso ajudá-lo(a) hoje?",
    category: "Saudações",
    usageCount: 342,
  },
  {
    id: "2",
    shortcut: "/aguarde",
    title: "Aguardar informações",
    message: "Por favor, aguarde um momento enquanto verifico as informações para você. Já retorno!",
    category: "Atendimento",
    usageCount: 256,
  },
  {
    id: "3",
    shortcut: "/prazo",
    title: "Prazo de entrega",
    message: "O prazo de entrega estimado é de 3 a 5 dias úteis após a confirmação do pagamento.",
    category: "Logística",
    usageCount: 189,
  },
  {
    id: "4",
    shortcut: "/obrigado",
    title: "Agradecimento",
    message: "Agradecemos pelo contato! Se tiver mais alguma dúvida, estamos à disposição. Tenha um ótimo dia!",
    category: "Saudações",
    usageCount: 421,
  },
  {
    id: "5",
    shortcut: "/rastreio",
    title: "Código de rastreio",
    message: "Seu código de rastreio é: [CÓDIGO]. Você pode acompanhar sua entrega no site dos Correios.",
    category: "Logística",
    usageCount: 167,
  },
  {
    id: "6",
    shortcut: "/troca",
    title: "Política de troca",
    message: "Nossa política de troca permite a substituição do produto em até 30 dias após o recebimento. Deseja iniciar o processo de troca?",
    category: "Suporte",
    usageCount: 98,
  },
];

const categories = ["Todas", "Saudações", "Atendimento", "Logística", "Suporte"];

export default function RespostasRapidas() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredReplies = quickReplies.filter((r) => {
    const matchesSearch =
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.shortcut.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "Todas" || r.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Mensagem copiada!");
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
                  <Label>Atalho</Label>
                  <Input placeholder="/atalho" />
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Input placeholder="Ex: Saudações" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input placeholder="Título da resposta" />
              </div>
              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea placeholder="Digite a mensagem..." rows={4} />
              </div>
              <Button className="w-full" onClick={() => setIsDialogOpen(false)}>
                Criar Resposta
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
          {categories.map((cat) => (
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
                <Badge variant="outline">{reply.category}</Badge>
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
                <Button variant="ghost" size="icon" className="w-8 h-8 text-destructive">
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
              Usado {reply.usageCount} vezes
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
