import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Search, Power, PowerOff, Edit, Globe } from "lucide-react";
import { useTenants, useCreateTenant, useToggleTenantStatus, useUpdateTenant, type Tenant } from "@/hooks/useTenant";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function SuperAdminTenants() {
  const { data: tenants, isLoading } = useTenants();
  const createTenant = useCreateTenant();
  const toggleStatus = useToggleTenantStatus();
  const updateTenant = useUpdateTenant();

  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  
  const [newTenant, setNewTenant] = useState({
    name: "",
    slug: "",
    owner_user_id: "",
    plan: "basic",
  });

  const filteredTenants = tenants?.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    await createTenant.mutateAsync({
      ...newTenant,
      custom_domain: null,
      is_active: true,
      referred_by: null,
      commission_rate: 50,
    });
    setIsCreateOpen(false);
    setNewTenant({ name: "", slug: "", owner_user_id: "", plan: "basic" });
  };

  const handleEdit = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setIsEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedTenant) return;
    
    await updateTenant.mutateAsync({
      id: selectedTenant.id,
      name: selectedTenant.name,
      custom_domain: selectedTenant.custom_domain,
      plan: selectedTenant.plan,
      commission_rate: selectedTenant.commission_rate,
    });
    setIsEditOpen(false);
    setSelectedTenant(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Clientes (Tenants)</CardTitle>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Novo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Novo Cliente</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nome da Empresa</Label>
                  <Input
                    value={newTenant.name}
                    onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                    placeholder="Ex: Empresa ABC"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug (URL)</Label>
                  <Input
                    value={newTenant.slug}
                    onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value.toLowerCase().replace(/\s/g, "-") })}
                    placeholder="Ex: empresa-abc"
                  />
                </div>
                <div className="space-y-2">
                  <Label>ID do Usuário Admin</Label>
                  <Input
                    value={newTenant.owner_user_id}
                    onChange={(e) => setNewTenant({ ...newTenant, owner_user_id: e.target.value })}
                    placeholder="UUID do usuário"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Plano</Label>
                  <Input
                    value={newTenant.plan}
                    onChange={(e) => setNewTenant({ ...newTenant, plan: e.target.value })}
                    placeholder="Ex: basic, pro, enterprise"
                  />
                </div>
                <Button onClick={handleCreate} className="w-full" disabled={createTenant.isPending}>
                  {createTenant.isPending ? "Criando..." : "Criar Cliente"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Domínio</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Código Afiliado</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTenants?.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">{tenant.name}</TableCell>
                  <TableCell className="text-muted-foreground">{tenant.slug}</TableCell>
                  <TableCell>
                    {tenant.custom_domain ? (
                      <div className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {tenant.custom_domain}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{tenant.plan}</Badge>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {tenant.affiliate_code}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={tenant.is_active ? "default" : "destructive"}>
                      {tenant.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {format(new Date(tenant.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(tenant)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleStatus.mutate({ id: tenant.id, is_active: !tenant.is_active })}
                      >
                        {tenant.is_active ? (
                          <PowerOff className="w-4 h-4 text-destructive" />
                        ) : (
                          <Power className="w-4 h-4 text-green-500" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredTenants?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Nenhum cliente encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Cliente</DialogTitle>
            </DialogHeader>
            {selectedTenant && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nome da Empresa</Label>
                  <Input
                    value={selectedTenant.name}
                    onChange={(e) => setSelectedTenant({ ...selectedTenant, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Domínio Personalizado</Label>
                  <Input
                    value={selectedTenant.custom_domain || ""}
                    onChange={(e) => setSelectedTenant({ ...selectedTenant, custom_domain: e.target.value || null })}
                    placeholder="Ex: crm.empresa.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Plano</Label>
                  <Input
                    value={selectedTenant.plan}
                    onChange={(e) => setSelectedTenant({ ...selectedTenant, plan: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Taxa de Comissão (%)</Label>
                  <Input
                    type="number"
                    value={selectedTenant.commission_rate}
                    onChange={(e) => setSelectedTenant({ ...selectedTenant, commission_rate: Number(e.target.value) })}
                  />
                </div>
                <Button onClick={handleSaveEdit} className="w-full" disabled={updateTenant.isPending}>
                  {updateTenant.isPending ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}