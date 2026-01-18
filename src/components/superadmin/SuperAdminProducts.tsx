import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, Check } from "lucide-react";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, type Product } from "@/hooks/useProducts";
import { Skeleton } from "@/components/ui/skeleton";

export function SuperAdminProducts() {
  const { data: products, isLoading } = useProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  const [newProduct, setNewProduct] = useState({
    name: "",
    description: "",
    price: 0,
    is_active: true,
    features: [] as string[],
  });
  const [newFeature, setNewFeature] = useState("");

  const handleCreate = async () => {
    await createProduct.mutateAsync(newProduct);
    setIsCreateOpen(false);
    setNewProduct({ name: "", description: "", price: 0, is_active: true, features: [] });
  };

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setIsEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedProduct) return;
    
    await updateProduct.mutateAsync({
      id: selectedProduct.id,
      name: selectedProduct.name,
      description: selectedProduct.description,
      price: selectedProduct.price,
      is_active: selectedProduct.is_active,
      features: selectedProduct.features,
    });
    setIsEditOpen(false);
    setSelectedProduct(null);
  };

  const addFeature = (isNew: boolean) => {
    if (!newFeature.trim()) return;
    
    if (isNew) {
      setNewProduct({ ...newProduct, features: [...newProduct.features, newFeature.trim()] });
    } else if (selectedProduct) {
      setSelectedProduct({
        ...selectedProduct,
        features: [...selectedProduct.features, newFeature.trim()],
      });
    }
    setNewFeature("");
  };

  const removeFeature = (index: number, isNew: boolean) => {
    if (isNew) {
      setNewProduct({
        ...newProduct,
        features: newProduct.features.filter((_, i) => i !== index),
      });
    } else if (selectedProduct) {
      setSelectedProduct({
        ...selectedProduct,
        features: selectedProduct.features.filter((_, i) => i !== index),
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Produtos</CardTitle>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Novo Produto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Criar Novo Produto</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
                <div className="space-y-2">
                  <Label>Nome do Produto</Label>
                  <Input
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    placeholder="Ex: Gatteflow Pro"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={newProduct.description}
                    onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                    placeholder="Descrição do produto..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Preço (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({ ...newProduct, price: Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Produto Ativo</Label>
                  <Switch
                    checked={newProduct.is_active}
                    onCheckedChange={(checked) => setNewProduct({ ...newProduct, is_active: checked })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Funcionalidades</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newFeature}
                      onChange={(e) => setNewFeature(e.target.value)}
                      placeholder="Ex: Atendimento WhatsApp"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addFeature(true))}
                    />
                    <Button type="button" onClick={() => addFeature(true)} size="icon">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {newProduct.features.map((feature, index) => (
                      <Badge key={index} variant="secondary" className="flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        {feature}
                        <button
                          onClick={() => removeFeature(index, true)}
                          className="ml-1 hover:text-destructive"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button onClick={handleCreate} className="w-full" disabled={createProduct.isPending}>
                  {createProduct.isPending ? "Criando..." : "Criar Produto"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Funcionalidades</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products?.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="max-w-xs truncate">{product.description}</TableCell>
                  <TableCell>
                    R$ {product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {product.features.slice(0, 3).map((feature, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {feature}
                        </Badge>
                      ))}
                      {product.features.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{product.features.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.is_active ? "default" : "secondary"}>
                      {product.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(product)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteProduct.mutate(product.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {products?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum produto cadastrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Editar Produto</DialogTitle>
            </DialogHeader>
            {selectedProduct && (
              <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
                <div className="space-y-2">
                  <Label>Nome do Produto</Label>
                  <Input
                    value={selectedProduct.name}
                    onChange={(e) => setSelectedProduct({ ...selectedProduct, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={selectedProduct.description || ""}
                    onChange={(e) => setSelectedProduct({ ...selectedProduct, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Preço (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={selectedProduct.price}
                    onChange={(e) => setSelectedProduct({ ...selectedProduct, price: Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Produto Ativo</Label>
                  <Switch
                    checked={selectedProduct.is_active}
                    onCheckedChange={(checked) => setSelectedProduct({ ...selectedProduct, is_active: checked })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Funcionalidades</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newFeature}
                      onChange={(e) => setNewFeature(e.target.value)}
                      placeholder="Adicionar funcionalidade"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addFeature(false))}
                    />
                    <Button type="button" onClick={() => addFeature(false)} size="icon">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedProduct.features.map((feature, index) => (
                      <Badge key={index} variant="secondary" className="flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        {feature}
                        <button
                          onClick={() => removeFeature(index, false)}
                          className="ml-1 hover:text-destructive"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button onClick={handleSaveEdit} className="w-full" disabled={updateProduct.isPending}>
                  {updateProduct.isPending ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}