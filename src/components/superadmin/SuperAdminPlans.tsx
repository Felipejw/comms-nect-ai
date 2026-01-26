import { useState } from "react";
import { Plus, Edit2, Trash2, Loader2, Users, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { 
  useAllSubscriptionPlans, 
  useCreateSubscriptionPlan, 
  useUpdateSubscriptionPlan, 
  useDeleteSubscriptionPlan,
  usePlanSubscribersCount,
  type SubscriptionPlan,
  type SubscriptionPlanLimits
} from "@/hooks/useSubscription";

interface PlanFormData {
  name: string;
  slug: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  features: string[];
  limits: SubscriptionPlanLimits;
  is_active: boolean;
  display_order: number;
}

const defaultFormData: PlanFormData = {
  name: "",
  slug: "",
  description: "",
  price_monthly: 0,
  price_yearly: 0,
  features: [],
  limits: {
    max_users: 5,
    max_connections: 2,
    max_contacts: 1000,
    max_campaigns_month: 10,
    has_chatbot: false,
    has_api_access: false,
  },
  is_active: true,
  display_order: 0,
};

export function SuperAdminPlans() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [formData, setFormData] = useState<PlanFormData>(defaultFormData);
  const [featuresText, setFeaturesText] = useState("");

  const { data: plans, isLoading } = useAllSubscriptionPlans();
  const { data: subscribersCounts } = usePlanSubscribersCount();
  const createPlan = useCreateSubscriptionPlan();
  const updatePlan = useUpdateSubscriptionPlan();
  const deletePlan = useDeleteSubscriptionPlan();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleOpenDialog = (plan?: SubscriptionPlan) => {
    if (plan) {
      setEditingPlan(plan);
      setFormData({
        name: plan.name,
        slug: plan.slug,
        description: plan.description || "",
        price_monthly: plan.price_monthly,
        price_yearly: plan.price_yearly,
        features: plan.features,
        limits: plan.limits,
        is_active: plan.is_active,
        display_order: plan.display_order,
      });
      setFeaturesText(plan.features.join("\n"));
    } else {
      setEditingPlan(null);
      setFormData(defaultFormData);
      setFeaturesText("");
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPlan(null);
    setFormData(defaultFormData);
    setFeaturesText("");
  };

  const handleSubmit = async () => {
    const features = featuresText.split("\n").filter(f => f.trim());
    const dataToSave = {
      ...formData,
      features,
    };

    if (editingPlan) {
      await updatePlan.mutateAsync({ id: editingPlan.id, ...dataToSave });
    } else {
      await createPlan.mutateAsync(dataToSave);
    }
    handleCloseDialog();
  };

  const handleDelete = async (id: string) => {
    if (confirm("Tem certeza que deseja excluir este plano? Esta ação não pode ser desfeita.")) {
      await deletePlan.mutateAsync(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Planos de Assinatura</CardTitle>
            <CardDescription>
              Gerencie os planos disponíveis para os clientes
            </CardDescription>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Plano
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Preço Mensal</TableHead>
              <TableHead>Preço Anual</TableHead>
              <TableHead>Assinantes</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans?.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{plan.name}</p>
                    <p className="text-sm text-muted-foreground">{plan.slug}</p>
                  </div>
                </TableCell>
                <TableCell>{formatCurrency(plan.price_monthly)}</TableCell>
                <TableCell>{formatCurrency(plan.price_yearly)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    {subscribersCounts?.[plan.id] || 0}
                  </div>
                </TableCell>
                <TableCell>
                  {plan.is_active ? (
                    <Badge className="bg-green-500">Ativo</Badge>
                  ) : (
                    <Badge variant="secondary">Inativo</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(plan)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDelete(plan.id)}
                      disabled={(subscribersCounts?.[plan.id] || 0) > 0}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {/* Plan Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPlan ? "Editar Plano" : "Novo Plano"}
            </DialogTitle>
            <DialogDescription>
              {editingPlan 
                ? "Faça as alterações necessárias no plano" 
                : "Preencha os dados para criar um novo plano"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Plano</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Profissional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s/g, '-') })}
                  placeholder="Ex: pro"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição curta do plano"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="price_monthly">Preço Mensal (R$)</Label>
                <Input
                  id="price_monthly"
                  type="number"
                  step="0.01"
                  value={formData.price_monthly}
                  onChange={(e) => setFormData({ ...formData, price_monthly: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price_yearly">Preço Anual (R$)</Label>
                <Input
                  id="price_yearly"
                  type="number"
                  step="0.01"
                  value={formData.price_yearly}
                  onChange={(e) => setFormData({ ...formData, price_yearly: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Limites do Plano</Label>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="max_users" className="text-sm">Máx. Usuários (-1 = ilimitado)</Label>
                  <Input
                    id="max_users"
                    type="number"
                    value={formData.limits.max_users}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      limits: { ...formData.limits, max_users: parseInt(e.target.value) || 0 }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_connections" className="text-sm">Máx. Conexões WhatsApp</Label>
                  <Input
                    id="max_connections"
                    type="number"
                    value={formData.limits.max_connections}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      limits: { ...formData.limits, max_connections: parseInt(e.target.value) || 0 }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_contacts" className="text-sm">Máx. Contatos</Label>
                  <Input
                    id="max_contacts"
                    type="number"
                    value={formData.limits.max_contacts}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      limits: { ...formData.limits, max_contacts: parseInt(e.target.value) || 0 }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_campaigns" className="text-sm">Máx. Campanhas/Mês</Label>
                  <Input
                    id="max_campaigns"
                    type="number"
                    value={formData.limits.max_campaigns_month}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      limits: { ...formData.limits, max_campaigns_month: parseInt(e.target.value) || 0 }
                    })}
                  />
                </div>
              </div>
              <div className="flex gap-6 mt-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="has_chatbot"
                    checked={formData.limits.has_chatbot}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      limits: { ...formData.limits, has_chatbot: checked }
                    })}
                  />
                  <Label htmlFor="has_chatbot" className="text-sm">Chatbot</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="has_api_access"
                    checked={formData.limits.has_api_access}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      limits: { ...formData.limits, has_api_access: checked }
                    })}
                  />
                  <Label htmlFor="has_api_access" className="text-sm">Acesso à API</Label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="features">Funcionalidades (uma por linha)</Label>
              <Textarea
                id="features"
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
                placeholder="Atendimento via WhatsApp&#10;Histórico de conversas&#10;Suporte por email"
                rows={5}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="display_order">Ordem de Exibição</Label>
                <Input
                  id="display_order"
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="flex items-center gap-2 pt-7">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Plano Ativo</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={createPlan.isPending || updatePlan.isPending}
            >
              {(createPlan.isPending || updatePlan.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingPlan ? "Salvar Alterações" : "Criar Plano"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
