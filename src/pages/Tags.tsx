import { useState } from "react";
import { Plus, Search, Edit, Trash2, Tag } from "lucide-react";
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

interface TagItem {
  id: string;
  name: string;
  color: string;
  count: number;
}

const tags: TagItem[] = [
  { id: "1", name: "VIP", color: "bg-yellow-500", count: 45 },
  { id: "2", name: "Premium", color: "bg-purple-500", count: 128 },
  { id: "3", name: "Suporte", color: "bg-blue-500", count: 312 },
  { id: "4", name: "Novo", color: "bg-green-500", count: 89 },
  { id: "5", name: "Empresarial", color: "bg-indigo-500", count: 67 },
  { id: "6", name: "Urgente", color: "bg-red-500", count: 23 },
  { id: "7", name: "Financeiro", color: "bg-emerald-500", count: 156 },
  { id: "8", name: "Reclamação", color: "bg-orange-500", count: 34 },
  { id: "9", name: "Cancelamento", color: "bg-rose-500", count: 18 },
  { id: "10", name: "Troca", color: "bg-cyan-500", count: 42 },
];

const colorOptions = [
  { name: "Vermelho", value: "bg-red-500" },
  { name: "Laranja", value: "bg-orange-500" },
  { name: "Amarelo", value: "bg-yellow-500" },
  { name: "Verde", value: "bg-green-500" },
  { name: "Azul", value: "bg-blue-500" },
  { name: "Roxo", value: "bg-purple-500" },
  { name: "Rosa", value: "bg-pink-500" },
  { name: "Ciano", value: "bg-cyan-500" },
];

export default function Tags() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState("bg-blue-500");

  const filteredTags = tags.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Tags</h2>
          <p className="text-muted-foreground">Organize seus contatos com tags personalizadas</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Nova Tag
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Tag</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome da Tag</Label>
                <Input placeholder="Ex: Cliente VIP" />
              </div>
              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => setSelectedColor(color.value)}
                      className={`w-8 h-8 rounded-full ${color.value} ${
                        selectedColor === color.value
                          ? "ring-2 ring-offset-2 ring-primary"
                          : ""
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div className="pt-2">
                <Label>Preview</Label>
                <div className="mt-2">
                  <Badge className={`${selectedColor} text-white`}>
                    <Tag className="w-3 h-3 mr-1" />
                    Nova Tag
                  </Badge>
                </div>
              </div>
              <Button className="w-full" onClick={() => setIsDialogOpen(false)}>
                Criar Tag
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredTags.map((tag) => (
          <div
            key={tag.id}
            className="bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow animate-fade-in"
          >
            <div className="flex items-start justify-between mb-3">
              <Badge className={`${tag.color} text-white`}>
                <Tag className="w-3 h-3 mr-1" />
                {tag.name}
              </Badge>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="w-8 h-8">
                  <Edit className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="w-8 h-8 text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {tag.count} contatos
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
