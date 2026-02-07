import { useState } from "react";
import { Plus, Search, Filter, MoreHorizontal, Play, Pause, BarChart3, Users, Send, Calendar, Trash2, Loader2, List, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCampaigns, useUpdateCampaign, useDeleteCampaign, useAddContactsToCampaign, Campaign } from "@/hooks/useCampaigns";
import { useContacts } from "@/hooks/useContacts";
import { useTags } from "@/hooks/useTags";
import { format } from "date-fns";
import { CampaignMetricsDashboard } from "@/components/campanhas/CampaignMetricsDashboard";
import { CampaignDialog } from "@/components/campanhas/CampaignDialog";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { ReadOnlyBadge } from "@/components/ui/ReadOnlyBadge";

const statusConfig = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  active: { label: "Ativa", className: "bg-success/10 text-success" },
  paused: { label: "Pausada", className: "bg-warning/10 text-warning" },
  completed: { label: "Concluída", className: "bg-primary/10 text-primary" },
};

export default function Campanhas() {
  const { hasPermission, isAdmin } = useAuth();
  const canEdit = isAdmin || hasPermission('campanhas', 'edit');
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isContactsDialogOpen, setIsContactsDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [activeTab, setActiveTab] = useState<"campaigns" | "metrics">("campaigns");
  
  // State for add contacts dialog
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const { data: campaigns = [], isLoading, isError, error, refetch } = useCampaigns();
  const { data: contacts = [] } = useContacts();
  const { data: tags = [] } = useTags();
  const updateCampaign = useUpdateCampaign();
  const deleteCampaign = useDeleteCampaign();
  const addContacts = useAddContactsToCampaign();

  const filteredCampaigns = campaigns.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    (statusFilter === "all" || c.status === statusFilter)
  );

  // Filter contacts by selected tags
  const filteredContacts = selectedTagIds.length > 0
    ? contacts.filter(contact => 
        contact.tags?.some(tag => selectedTagIds.includes(tag.id))
      )
    : contacts;

  const handleUpdateStatus = async (campaignId: string, status: "active" | "paused" | "completed") => {
    await updateCampaign.mutateAsync({ id: campaignId, status });
  };

  const handleDelete = async () => {
    if (!selectedCampaign) return;
    await deleteCampaign.mutateAsync(selectedCampaign.id);
    setIsDeleteDialogOpen(false);
    setSelectedCampaign(null);
  };

  const openDeleteDialog = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setIsDeleteDialogOpen(true);
  };

  const openContactsDialog = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setSelectedContactIds([]);
    setSelectedTagIds([]);
    setIsContactsDialogOpen(true);
  };

  const handleAddContactsToCampaign = async () => {
    if (!selectedCampaign || selectedContactIds.length === 0) return;
    await addContacts.mutateAsync({
      campaignId: selectedCampaign.id,
      contactIds: selectedContactIds,
    });
    setIsContactsDialogOpen(false);
    setSelectedCampaign(null);
    setSelectedContactIds([]);
  };

  const toggleContact = (contactId: string) => {
    setSelectedContactIds(prev => 
      prev.includes(contactId) 
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(prev => 
      prev.includes(tagId) 
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const selectAllContacts = () => {
    setSelectedContactIds(filteredContacts.map(c => c.id));
  };

  const deselectAllContacts = () => {
    setSelectedContactIds([]);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive font-medium">Erro ao carregar campanhas</p>
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
            <h2 className="text-2xl font-bold">Disparo em Massa</h2>
            <p className="text-muted-foreground">Crie e gerencie seus disparos de mensagens</p>
          </div>
          {!canEdit && <ReadOnlyBadge />}
        </div>
        <Button className="gap-2" onClick={() => setIsDialogOpen(true)} disabled={!canEdit}>
          <Plus className="w-4 h-4" />
          Novo Disparo
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "campaigns" | "metrics")} className="space-y-6">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="campaigns" className="gap-2">
              <List className="w-4 h-4" />
              Campanhas
            </TabsTrigger>
            <TabsTrigger value="metrics" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
          </TabsList>
          
          {activeTab === "campaigns" && (
            <div className="flex items-center gap-4">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar disparos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-[300px]"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Filter className="w-4 h-4" />
                    Filtrar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setStatusFilter("all")}>
                    Todas
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("draft")}>
                    Rascunho
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("active")}>
                    Ativas
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("paused")}>
                    Pausadas
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("completed")}>
                    Concluídas
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        <TabsContent value="metrics" className="mt-6">
          <CampaignMetricsDashboard />
        </TabsContent>

        <TabsContent value="campaigns" className="mt-6">
          {filteredCampaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Send className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum disparo encontrado</h3>
              <p className="text-muted-foreground mb-4">Crie seu primeiro disparo em massa para começar</p>
              <Button onClick={() => setIsDialogOpen(true)} disabled={!canEdit}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Disparo
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredCampaigns.map((campaign) => {
                const deliveryRate = campaign.sent_count && campaign.sent_count > 0 
                  ? Math.round(((campaign.delivered_count || 0) / campaign.sent_count) * 100) 
                  : 0;
                const openRate = campaign.delivered_count && campaign.delivered_count > 0 
                  ? Math.round(((campaign.read_count || 0) / campaign.delivered_count) * 100) 
                  : 0;

                return (
                  <Card key={campaign.id} className="animate-fade-in">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-lg">{campaign.name}</CardTitle>
                          <CardDescription>{campaign.description || "Sem descrição"}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={statusConfig[campaign.status].className}>
                            {statusConfig[campaign.status].label}
                          </Badge>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openContactsDialog(campaign)} disabled={!canEdit}>
                                <Users className="w-4 h-4 mr-2" />
                                Adicionar contatos
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setSelectedCampaign(campaign);
                                setActiveTab("metrics");
                              }}>
                                <BarChart3 className="w-4 h-4 mr-2" />
                                Ver estatísticas
                              </DropdownMenuItem>
                              {campaign.status === "active" ? (
                                <DropdownMenuItem onClick={() => handleUpdateStatus(campaign.id, "paused")} disabled={!canEdit}>
                                  <Pause className="w-4 h-4 mr-2" />
                                  Pausar
                                </DropdownMenuItem>
                              ) : campaign.status === "paused" || campaign.status === "draft" ? (
                                <DropdownMenuItem onClick={() => handleUpdateStatus(campaign.id, "active")} disabled={!canEdit}>
                                  <Play className="w-4 h-4 mr-2" />
                                  {campaign.status === "draft" ? "Iniciar" : "Retomar"}
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => openDeleteDialog(campaign)}
                                disabled={!canEdit}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                            <Send className="w-4 h-4" />
                            <span className="text-xs">Enviadas</span>
                          </div>
                          <p className="font-semibold">{(campaign.sent_count || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                            <Users className="w-4 h-4" />
                            <span className="text-xs">Entregues</span>
                          </div>
                          <p className="font-semibold">{(campaign.delivered_count || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                            <BarChart3 className="w-4 h-4" />
                            <span className="text-xs">Lidas</span>
                          </div>
                          <p className="font-semibold">{(campaign.read_count || 0).toLocaleString()}</p>
                        </div>
                      </div>

                      {campaign.status !== "draft" && campaign.sent_count && campaign.sent_count > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Taxa de entrega</span>
                            <span className="font-medium">{deliveryRate}%</span>
                          </div>
                          <Progress value={deliveryRate} className="h-2" />
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
                        <span className="text-muted-foreground">
                          {campaign.scheduled_at ? (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              Agendada para {format(new Date(campaign.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </span>
                          ) : (
                            `Criada em ${format(new Date(campaign.created_at), "dd/MM/yyyy", { locale: ptBR })}`
                          )}
                        </span>
                        {campaign.status !== "draft" && campaign.delivered_count && campaign.delivered_count > 0 && (
                          <span className="text-muted-foreground">
                            Taxa de leitura: <strong className="text-foreground">{openRate}%</strong>
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Campaign Dialog */}
      <CampaignDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a campanha "{selectedCampaign?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Contacts to Campaign Dialog */}
      <Dialog open={isContactsDialogOpen} onOpenChange={setIsContactsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Contatos à Campanha</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Filtrar por Tags</Label>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant={selectedTagIds.includes(tag.id) ? "default" : "outline"}
                    className="cursor-pointer"
                    style={selectedTagIds.includes(tag.id) ? { backgroundColor: tag.color } : {}}
                    onClick={() => toggleTag(tag.id)}
                  >
                    <Tag className="w-3 h-3 mr-1" />
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Selecionar Contatos ({selectedContactIds.length} selecionados)</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllContacts}>
                  Selecionar todos
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAllContacts}>
                  Limpar
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[300px] border rounded-lg p-2">
              {filteredContacts.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Nenhum contato encontrado
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredContacts.map((contact) => (
                    <div 
                      key={contact.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                      onClick={() => toggleContact(contact.id)}
                    >
                      <Checkbox 
                        checked={selectedContactIds.includes(contact.id)}
                        onCheckedChange={() => toggleContact(contact.id)}
                      />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{contact.name}</p>
                        <p className="text-xs text-muted-foreground">{contact.phone || contact.email || "Sem contato"}</p>
                      </div>
                      {contact.tags && contact.tags.length > 0 && (
                        <div className="flex gap-1">
                          {contact.tags.slice(0, 2).map((tag) => (
                            <Badge 
                              key={tag.id} 
                              variant="secondary" 
                              className="text-xs"
                              style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                            >
                              {tag.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsContactsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleAddContactsToCampaign}
              disabled={selectedContactIds.length === 0 || addContacts.isPending}
            >
              {addContacts.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Adicionar {selectedContactIds.length} contatos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
