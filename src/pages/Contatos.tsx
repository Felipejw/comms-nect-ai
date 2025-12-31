import { useState } from "react";
import { Search, Plus, Filter, MoreHorizontal, MessageSquare, Edit, Trash2, Loader2, Eye, Phone, Mail, Building, Tag, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useContacts, useCreateContact, useDeleteContact, useUpdateContact, Contact } from "@/hooks/useContacts";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Contatos() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [newContact, setNewContact] = useState({ name: "", email: "", phone: "", company: "", notes: "" });
  const [editContact, setEditContact] = useState({ name: "", email: "", phone: "", company: "", notes: "" });
  
  const { data: contacts, isLoading } = useContacts();
  const createContact = useCreateContact();
  const deleteContact = useDeleteContact();
  const updateContact = useUpdateContact();

  const filteredContacts = contacts?.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone?.includes(searchQuery)
  ) || [];

  const handleCreateContact = async () => {
    if (!newContact.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    
    await createContact.mutateAsync({
      name: newContact.name.trim(),
      email: newContact.email.trim() || undefined,
      phone: newContact.phone.trim() || undefined,
      company: newContact.company.trim() || undefined,
      notes: newContact.notes.trim() || undefined,
    });
    
    setNewContact({ name: "", email: "", phone: "", company: "", notes: "" });
    setIsDialogOpen(false);
  };

  const handleUpdateContact = async () => {
    if (!selectedContact || !editContact.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    
    await updateContact.mutateAsync({
      id: selectedContact.id,
      name: editContact.name.trim(),
      email: editContact.email.trim() || undefined,
      phone: editContact.phone.trim() || undefined,
      company: editContact.company.trim() || undefined,
      notes: editContact.notes.trim() || undefined,
    });
    
    setIsEditDialogOpen(false);
    setSelectedContact(null);
  };

  const handleDeleteContact = async () => {
    if (!selectedContact) return;
    await deleteContact.mutateAsync(selectedContact.id);
    setIsDeleteDialogOpen(false);
    setSelectedContact(null);
  };

  const openViewDialog = (contact: Contact) => {
    setSelectedContact(contact);
    setIsViewDialogOpen(true);
  };

  const openEditDialog = (contact: Contact) => {
    setSelectedContact(contact);
    setEditContact({
      name: contact.name,
      email: contact.email || "",
      phone: contact.phone || "",
      company: contact.company || "",
      notes: contact.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (contact: Contact) => {
    setSelectedContact(contact);
    setIsDeleteDialogOpen(true);
  };

  const formatLastContact = (date: string | null) => {
    if (!date) return "Nunca";
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Contatos</h2>
          <p className="text-muted-foreground">
            {contacts?.length || 0} contatos cadastrados
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Novo Contato
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Contato</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input 
                  placeholder="Nome completo"
                  value={newContact.name}
                  onChange={(e) => setNewContact(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input 
                  type="email" 
                  placeholder="email@exemplo.com"
                  value={newContact.email}
                  onChange={(e) => setNewContact(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input 
                  placeholder="(00) 00000-0000"
                  value={newContact.phone}
                  onChange={(e) => setNewContact(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Input 
                  placeholder="Nome da empresa"
                  value={newContact.company}
                  onChange={(e) => setNewContact(prev => ({ ...prev, company: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea 
                  placeholder="Observações sobre o contato"
                  value={newContact.notes}
                  onChange={(e) => setNewContact(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>
              <Button 
                className="w-full" 
                onClick={handleCreateContact}
                disabled={createContact.isPending}
              >
                {createContact.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Contato"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contatos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" className="gap-2">
          <Filter className="w-4 h-4" />
          Filtrar
        </Button>
      </div>

      <div className="table-container">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contato</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Último Contato</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredContacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {searchQuery ? "Nenhum contato encontrado" : "Nenhum contato cadastrado"}
                </TableCell>
              </TableRow>
            ) : (
              filteredContacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={contact.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                          {contact.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{contact.name}</p>
                        <p className="text-sm text-muted-foreground">{contact.email || "-"}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{contact.phone || "-"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {contact.tags?.map((tag) => (
                        <Badge 
                          key={tag.id} 
                          variant="secondary" 
                          className="text-xs"
                          style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                        >
                          {tag.name}
                        </Badge>
                      ))}
                      {(!contact.tags || contact.tags.length === 0) && (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{formatLastContact(contact.last_contact_at)}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        contact.status === "active"
                          ? "bg-success/10 text-success"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {contact.status === "active" ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openViewDialog(contact)}>
                          <Eye className="w-4 h-4 mr-2" />
                          Ver informações
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Iniciar conversa
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditDialog(contact)}>
                          <Edit className="w-4 h-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive"
                          onClick={() => openDeleteDialog(contact)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* View Contact Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Informações do Contato</DialogTitle>
          </DialogHeader>
          {selectedContact && (
            <div className="space-y-6 py-4">
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={selectedContact.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xl">
                    {selectedContact.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-semibold">{selectedContact.name}</h3>
                  <Badge
                    className={
                      selectedContact.status === "active"
                        ? "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {selectedContact.status === "active" ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3">
                {selectedContact.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedContact.email}</span>
                  </div>
                )}
                {selectedContact.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedContact.phone}</span>
                  </div>
                )}
                {selectedContact.company && (
                  <div className="flex items-center gap-3 text-sm">
                    <Building className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedContact.company}</span>
                  </div>
                )}
              </div>

              {selectedContact.tags && selectedContact.tags.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Tag className="w-4 h-4" />
                    <span>Tags</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedContact.tags.map((tag) => (
                      <Badge 
                        key={tag.id} 
                        variant="secondary"
                        style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedContact.notes && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="w-4 h-4" />
                    <span>Notas</span>
                  </div>
                  <p className="text-sm bg-muted/50 rounded-lg p-3">{selectedContact.notes}</p>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setIsViewDialogOpen(false);
                    openEditDialog(selectedContact);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
                <Button className="flex-1">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Iniciar Conversa
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Contact Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Contato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input 
                placeholder="Nome completo"
                value={editContact.name}
                onChange={(e) => setEditContact(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input 
                type="email" 
                placeholder="email@exemplo.com"
                value={editContact.email}
                onChange={(e) => setEditContact(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input 
                placeholder="(00) 00000-0000"
                value={editContact.phone}
                onChange={(e) => setEditContact(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Input 
                placeholder="Nome da empresa"
                value={editContact.company}
                onChange={(e) => setEditContact(prev => ({ ...prev, company: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea 
                placeholder="Observações sobre o contato"
                value={editContact.notes}
                onChange={(e) => setEditContact(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
            <Button 
              className="w-full" 
              onClick={handleUpdateContact}
              disabled={updateContact.isPending}
            >
              {updateContact.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Alterações"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o contato "{selectedContact?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button 
              variant="destructive" 
              onClick={handleDeleteContact}
              disabled={deleteContact.isPending}
            >
              {deleteContact.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}